import { Router } from 'express';
import { getTenantDb } from '../tenantDb';
import { getRegistryDb } from '../registry';
import { hashPassword, signToken, loginAttempts, MAX_ATTEMPTS, LOCKOUT_TIME } from '../middleware/auth';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password, companyName } = req.body;
  
  // Superadmin bypass
  if (email === process.env.SUPERADMIN_EMAIL && password === process.env.SUPERADMIN_PASSWORD) {
      const token = signToken({
        userId: 'superadmin',
        role: 'admin',
        name: 'Super Admin',
        companyName: 'SUPERADMIN',
        email: process.env.SUPERADMIN_EMAIL || 'superadmin@logro.com'
      });
      return res.json({
        token,
        user: {
          id: 'superadmin',
          name: 'Super Admin',
          email: process.env.SUPERADMIN_EMAIL,
          role: 'admin',
          status: 'active'
        }
      });
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'Please provide email and password' });
  }

  const emailKey = email.toLowerCase().trim();

  // Check if locked out
  const attempt = loginAttempts[emailKey];
  if (attempt && attempt.lockoutUntil > Date.now()) {
    const minutesLeft = Math.ceil((attempt.lockoutUntil - Date.now()) / (60 * 1000));
    return res.status(429).json({
      error: `Too many login attempts. Please try again after ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`
    });
  }

  let targetCompanyName = companyName || 'DefaultCompany';
  let user: any = null;
  let company: any = null;

  try {
    const registryDb = await getRegistryDb();
    const companies = await registryDb.collection('companies').find({}).toArray();

    // If companyName is 'DefaultCompany' or not specified, search across all registered companies
    if (targetCompanyName === 'DefaultCompany') {
      for (const comp of companies) {
        const tenantDb = await getTenantDb(comp.companyName);
        const foundUser = await tenantDb.collection('users').findOne({ email: { $regex: new RegExp(`^${emailKey}$`, 'i') } });
        if (foundUser) {
          user = foundUser;
          targetCompanyName = comp.companyName;
          break;
        }
      }
    }

    // Fallback: search in targetCompanyName database
    if (!user) {
      const tenantDb = await getTenantDb(targetCompanyName);
      user = await tenantDb.collection('users').findOne({ email: { $regex: new RegExp(`^${emailKey}$`, 'i') } });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Block logins for suspended or expired companies
    company = companies.find(c => c.companyName.toLowerCase() === targetCompanyName.toLowerCase());
    if (company) {
      if (company.status === 'suspended') {
        return res.status(403).json({ error: 'This company account has been suspended. Please contact the system administrator.' });
      }
      if (company.status === 'trial' && company.trialUntil && new Date(company.trialUntil) < new Date()) {
        return res.status(403).json({ error: 'Your trial period has expired. Please contact the system administrator to activate your account.' });
      }
      if (company.validUntil && new Date(company.validUntil) < new Date()) {
        return res.status(403).json({ error: 'Your subscription has expired. Please contact the system administrator.' });
      }
    }
  } catch (err: any) {
    console.error('Error during login tenant resolution:', err);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }

  const expectedPassword = user.password || 'password123';
  if (password !== expectedPassword) {
    // Record failed attempt
    const currentAttempt = loginAttempts[emailKey] || { attempts: 0, lockoutUntil: 0 };
    
    // If lockout expired, reset
    if (currentAttempt.lockoutUntil > 0 && currentAttempt.lockoutUntil <= Date.now()) {
      currentAttempt.attempts = 0;
      currentAttempt.lockoutUntil = 0;
    }

    currentAttempt.attempts += 1;
    if (currentAttempt.attempts >= MAX_ATTEMPTS) {
      currentAttempt.lockoutUntil = Date.now() + LOCKOUT_TIME;
      loginAttempts[emailKey] = currentAttempt;
      return res.status(429).json({
        error: `Too many login attempts. Account is temporarily locked. Please try again after 15 minutes.`
      });
    }

    loginAttempts[emailKey] = currentAttempt;
    const remaining = MAX_ATTEMPTS - currentAttempt.attempts;
    return res.status(401).json({
      error: `Invalid email or password. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`
    });
  }

  // Successful login: reset attempts
  delete loginAttempts[emailKey];

  const token = signToken({
    userId: user.id,
    role: user.role,
    name: user.name,
    companyName: targetCompanyName,
    email: user.email
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      status: user.status,
      companyName: targetCompanyName,
      companyStatus: company?.status,
      companyTrialUntil: company?.trialUntil,
      companyValidUntil: company?.validUntil
    }
  });
});

router.post('/activate', async (req, res) => {
  const { email, productKey } = req.body;
  if (!email || !productKey) {
    return res.status(400).json({ error: 'Email and product key are required.' });
  }

  try {
    const registryDb = await getRegistryDb();
    const companies = await registryDb.collection('companies').find({}).toArray();

    const submittedKey = productKey.trim().toUpperCase();

    // 1. Search for a generated unique key
    let foundCompany = companies.find(c => c.activationKey && c.activationKey.key.toUpperCase() === submittedKey);
    let newStatus = '';
    let expiry = new Date();
    let isTrial = false;
    let isLifetime = false;
    let targetCompanyName = '';

    if (foundCompany) {
      const actKey = foundCompany.activationKey;
      newStatus = actKey.status;
      isTrial = newStatus === 'trial';
      isLifetime = actKey.durationUnit === 'lifetime';
      const durationVal = Number(actKey.durationValue) || 12;

      if (!isLifetime) {
        if (actKey.durationUnit === 'minutes') {
          expiry.setMinutes(expiry.getMinutes() + durationVal);
        } else if (actKey.durationUnit === 'hours') {
          expiry.setHours(expiry.getHours() + durationVal);
        } else if (actKey.durationUnit === 'days') {
          expiry.setDate(expiry.getDate() + durationVal);
        } else if (actKey.durationUnit === 'months') {
          expiry.setMonth(expiry.getMonth() + durationVal);
        }
      }
      targetCompanyName = foundCompany.companyName;
    } else {
      // 2. Fallback to name-based keys
      const emailKey = email.toLowerCase().trim();
      for (const comp of companies) {
        const tenantDb = await getTenantDb(comp.companyName);
        const foundUser = await tenantDb.collection('users').findOne({ email: { $regex: new RegExp(`^${emailKey}$`, 'i') } });
        if (foundUser) {
          targetCompanyName = comp.companyName;
          break;
        }
      }

      if (!targetCompanyName) {
        return res.status(404).json({ error: 'No associated company found for this email address.' });
      }

      foundCompany = companies.find(c => c.companyName === targetCompanyName);
      if (!foundCompany) {
        return res.status(404).json({ error: 'Company not found.' });
      }

      const companyCleanName = targetCompanyName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const expectedTrialKey = `LOGRO-TRIAL-${companyCleanName}-2026`;
      const expectedActiveKey = `LOGRO-ACTIVE-${companyCleanName}-9999`;

      if (submittedKey !== expectedTrialKey && submittedKey !== expectedActiveKey) {
        return res.status(400).json({ error: 'Invalid product key. Please check the spelling or contact support.' });
      }

      const isTrialKey = submittedKey === expectedTrialKey;
      newStatus = isTrialKey ? 'trial' : 'active';
      isTrial = isTrialKey;
      if (isTrialKey) {
        expiry.setDate(expiry.getDate() + 14); // 14 days
      } else {
        expiry.setFullYear(expiry.getFullYear() + 1); // 1 year
      }
    }

    // Update DB
    await registryDb.collection('companies').updateOne(
      { _id: foundCompany._id },
      {
        $set: {
          status: newStatus,
          validUntil: isLifetime ? null : (isTrial ? null : expiry.toISOString()),
          trialUntil: isLifetime ? null : (isTrial ? expiry.toISOString() : null),
          activationKey: null // consume key
        }
      }
    );

    return res.json({
      success: true,
      message: `Account activated successfully! Subscription type set to "${newStatus}"${isLifetime ? ' (Lifetime)' : ` valid until ${expiry.toLocaleDateString()}`}.`,
      companyStatus: newStatus,
      companyTrialUntil: isLifetime ? null : (isTrial ? expiry.toISOString() : null),
      companyValidUntil: isLifetime ? null : (isTrial ? null : expiry.toISOString())
    });
  } catch (err: any) {
    console.error('Activation error:', err);
    return res.status(500).json({ error: 'Internal server error during activation.' });
  }
});

export default router;
