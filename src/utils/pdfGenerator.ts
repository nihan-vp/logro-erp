import { jsPDF } from 'jspdf';
import { CrewMember } from '../types';
import { notify } from './toast';

const formatLocalDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const savePdf = (doc: jsPDF, fileName: string) => {
  const channel = (window as any).PdfDownloadChannel;
  if (channel && typeof channel.postMessage === 'function') {
    const base64String = doc.output('datauristring').split(',')[1];
    channel.postMessage(JSON.stringify({ blobData: base64String, name: fileName }));
  } else {
    doc.save(fileName);
  }
};

interface GenerateAllWorkersPdfParams {
  customStartStr: string;
  customEndStr: string;
  attendanceLogs: any[];
  projects: any[];
  overviewFilterType: 'weekly' | 'monthly';
  selectedMonthVal: number;
  selectedYearVal: number;
  crew: CrewMember[];
}

export const generateAllWorkersAttendancePdf = ({
  customStartStr,
  customEndStr,
  attendanceLogs,
  projects,
  overviewFilterType,
  selectedMonthVal,
  selectedYearVal,
  crew,
}: GenerateAllWorkersPdfParams) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const cZinc950 = [9, 9, 11];
    const cZinc700 = [113, 113, 122];
    const cZinc500 = [161, 161, 170];
    const cEmerald = [5, 150, 105];
    const cAmber = [217, 119, 6];
    const cRed = [185, 28, 28];

    // 1. Determine period dates
    const startDate = new Date(customStartStr);
    const endDate = new Date(customEndStr);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const days: Date[] = [];
    const currDate = new Date(startDate);
    while (currDate <= endDate) {
      days.push(new Date(currDate));
      currDate.setDate(currDate.getDate() + 1);
    }

    if (days.length === 0) {
      notify.warning('Selected start date must be on or before end date.');
      return;
    }

    const startStr = customStartStr;
    const endStr = customEndStr;

    // 2. Fetch all logs matching this date range
    const filteredLogs = attendanceLogs.filter(a =>
      a.date >= startStr &&
      a.date <= endStr
    );

    // 3. Build Project Abbreviation Legend Map
    const getProjectAbbr = (name: string): string => {
      if (!name) return '';
      return name
        .split(/[\s-_]+/)
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 3);
    };

    const usedProjectsMap = new Map<string, { name: string, abbr: string }>();
    projects.forEach(p => {
      usedProjectsMap.set(p.id, { name: p.projectName, abbr: getProjectAbbr(p.projectName) });
    });

    // Width calculations (Portrait: A4 width is 210mm)
    const startX = 10;
    const endX = 200;
    const printableWidth = endX - startX; // 190mm
    const workerColWidth = 32;
    const dateAreaWidth = printableWidth - workerColWidth; // 158mm
    const numDays = days.length;
    const colWidth = dateAreaWidth / numDays;

    const drawHeader = (pageNum: number) => {
      doc.setTextColor(cZinc950[0], cZinc950[1], cZinc950[2]);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('LOGRO', startX, 12);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
      doc.text('CONSTRUCTION ERP', startX, 15);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(cZinc950[0], cZinc950[1], cZinc950[2]);
      doc.text('ALL WORKERS ATTENDANCE MATRIX', endX, 12, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
      const periodStr = overviewFilterType === 'weekly'
        ? `Week: ${startStr} to ${endStr}`
        : `Month: ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][selectedMonthVal]} ${selectedYearVal}`;
      doc.text(`${periodStr}  |  Page ${pageNum}`, endX, 15, { align: 'right' });

      doc.setDrawColor(228, 228, 231);
      doc.setLineWidth(0.4);
      doc.line(startX, 16.5, endX, 16.5);

      // Draw Project Legend
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
      doc.text('PROJECT CODES:', startX, 20.5);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(5.5);
      let legendX = 35;
      let legendY = 20.5;
      usedProjectsMap.forEach((val) => {
        if (legendX > 145) {
          legendX = 35;
          legendY += 2.5;
        }
        doc.text(`${val.abbr}: ${val.name}`, legendX, legendY);
        legendX += 30;
      });

      // Draw Status Legend
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(6);
      doc.text('P: Present   H: Half Day   A: Absent   —: No Log', endX, legendY, { align: 'right' });

      doc.line(startX, legendY + 2.5, endX, legendY + 2.5);
      return legendY + 2.5;
    };

    const drawTableHeaders = (startY: number) => {
      doc.setFillColor(244, 244, 245);
      doc.rect(startX, startY, printableWidth, 8, 'F');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
      doc.text('WORKER / TRADE', startX + 2, startY + 5.5);

      days.forEach((d, i) => {
        const colX = startX + workerColWidth + (i * colWidth);
        doc.setFontSize(5.5);
        const label = overviewFilterType === 'weekly'
          ? `${d.getDate()} (${d.toLocaleDateString('en-US', { weekday: 'narrow' })})`
          : `${d.getDate()}`;
        doc.text(label, colX + (colWidth / 2), startY + 5.5, { align: 'center' });
      });
    };

    let page = 1;
    let legendHeightY = drawHeader(page);
    let currentY = legendHeightY + 3;
    drawTableHeaders(currentY);
    currentY += 8;

    if (crew.length === 0) {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
      doc.text('No workers registered in the roster.', startX + 2, currentY + 8);
    } else {
      crew.forEach((member, idx) => {
        if (currentY > 265) {
          doc.addPage();
          page++;
          legendHeightY = drawHeader(page);
          currentY = legendHeightY + 3;
          drawTableHeaders(currentY);
          currentY += 8;
        }

        // Alternating row background
        if (idx % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(startX, currentY, printableWidth, 9, 'F');
        }

        // Row border
        doc.setDrawColor(244, 244, 245);
        doc.setLineWidth(0.3);
        doc.line(startX, currentY + 9, endX, currentY + 9);

        // Print Worker Name
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(cZinc950[0], cZinc950[1], cZinc950[2]);
        doc.text(member.name, startX + 2, currentY + 4);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
        doc.text(member.trade, startX + 2, currentY + 7.5);

        // Fill date columns
        days.forEach((d, i) => {
          const colX = startX + workerColWidth + (i * colWidth);
          const dateStr = formatLocalDate(d);
          const log = filteredLogs.find(a => a.workerName === member.name && a.date === dateStr);

          if (log) {
            let cellBg = [255, 255, 255];
            let cellTextClr = cZinc950;
            if (log.status === 'Present' || log.status === 'Half Day') {
              if (log.status === 'Present') {
                cellBg = [209, 250, 229]; // light green
                cellTextClr = [6, 95, 70]; // dark green
              } else {
                cellBg = [219, 234, 254]; // light blue
                cellTextClr = [30, 58, 138]; // dark blue
              }

              doc.setFillColor(cellBg[0], cellBg[1], cellBg[2]);
              doc.rect(colX, currentY, colWidth, 9, 'F');

              const project = projects.find(p => p.id === log.projectId);
              const projectText = project ? project.projectName : 'Unknown';
              const projectAbbr = project ? getProjectAbbr(project.projectName) : '??';

              doc.setTextColor(cellTextClr[0], cellTextClr[1], cellTextClr[2]);
              doc.setFont('Helvetica', 'bold');
              if (colWidth >= 20) {
                doc.setFontSize(6.5);
                const wrapped = doc.splitTextToSize(projectText, colWidth - 2);
                doc.text(wrapped, colX + (colWidth / 2), currentY + 5.5, { align: 'center' });
              } else {
                doc.setFontSize(7.5);
                doc.text(projectAbbr, colX + (colWidth / 2), currentY + 5.5, { align: 'center' });
              }
            } else if (log.status === 'Absent') {
              cellBg = [254, 226, 226]; // light red
              cellTextClr = [153, 27, 27]; // dark red

              doc.setFillColor(cellBg[0], cellBg[1], cellBg[2]);
              doc.rect(colX, currentY, colWidth, 9, 'F');

              doc.setTextColor(cellTextClr[0], cellTextClr[1], cellTextClr[2]);
              doc.setFont('Helvetica', 'bold');
              doc.setFontSize(colWidth >= 20 ? 7 : 5.5);
              doc.text('Absent', colX + (colWidth / 2), currentY + 5.5, { align: 'center' });
            } else {
              doc.setFont('Helvetica', 'normal');
              doc.setFontSize(7);
              doc.setTextColor(cZinc500[0], cZinc500[1], cZinc500[2]);
              doc.text('—', colX + (colWidth / 2), currentY + 5.5, { align: 'center' });
            }
          } else {
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(cZinc500[0], cZinc500[1], cZinc500[2]);
            doc.text('—', colX + (colWidth / 2), currentY + 5.5, { align: 'center' });
          }
        });

        currentY += 9;
      });
    }

    savePdf(doc, `all_workers_attendance_${startStr}_to_${endStr}.pdf`);
    notify.success('All workers attendance PDF statement downloaded.');
  } catch (pdfErr) {
    console.error('All Workers PDF Generation Error:', pdfErr);
    notify.error('Failed to generate all workers PDF report.');
  }
};

interface GenerateSingleWorkerPdfParams {
  worker: CrewMember;
  workerAtt: any[];
  workerPayments: any[];
  daysPresent: number;
  daysHalf: number;
  daysAbsent: number;
  totalEarned: number;
  totalPaid: number;
  remainingToPay: number;
  startStr: string;
  endStr: string;
  projects: any[];
  tasks: any[];
  overviewFilterType: 'weekly' | 'monthly';
  selectedMonthVal: number;
  selectedYearVal: number;
  selectedWeekOffset: number;
  attendanceLogs: any[];
}

export const generateSingleWorkerAttendancePdf = ({
  worker,
  workerAtt,
  workerPayments,
  daysPresent,
  daysHalf,
  daysAbsent,
  totalEarned,
  totalPaid,
  remainingToPay,
  startStr,
  endStr,
  projects,
  tasks,
  overviewFilterType,
  selectedMonthVal,
  selectedYearVal,
  selectedWeekOffset,
  attendanceLogs,
}: GenerateSingleWorkerPdfParams) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const generatedDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const cZinc950 = [9, 9, 11];
    const cZinc700 = [113, 113, 122];
    const cZinc500 = [161, 161, 170];
    const cEmerald = [5, 150, 105];
    const cAmber = [217, 119, 6];
    const cRed = [185, 28, 28];

    doc.setTextColor(cZinc950[0], cZinc950[1], cZinc950[2]);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('LOGRO', 15, 20);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
    doc.text('CONSTRUCTION ERP', 15, 24);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(cZinc950[0], cZinc950[1], cZinc950[2]);
    doc.text('WORKER STATEMENT', 195, 20, { align: 'right' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
    doc.text(`Generated: ${generatedDate}`, 195, 24, { align: 'right' });

    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.5);
    doc.line(15, 28, 195, 28);

    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(244, 244, 245);
    doc.roundedRect(15, 33, 85, 28, 2, 2, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
    doc.text('WORKER INFORMATION', 19, 38);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Name:', 19, 44);
    doc.text('Trade:', 19, 49);
    doc.text('Wage Rate:', 19, 54);

    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(cZinc950[0], cZinc950[1], cZinc950[2]);
    doc.text(worker.name, 42, 44);
    doc.text(worker.trade, 42, 49);
    doc.text(`Rs. ${worker.dailyWage.toLocaleString('en-IN')}/day`, 42, 54);

    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(244, 244, 245);
    doc.roundedRect(110, 33, 85, 28, 2, 2, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
    doc.text('REPORT DETAILS', 114, 38);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Period:', 114, 44);
    doc.text('Date Range:', 114, 49);

    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(cZinc950[0], cZinc950[1], cZinc950[2]);
    doc.text(overviewFilterType === 'weekly' ? 'Weekly' : 'Monthly', 137, 44);
    doc.text(`${startStr} to ${endStr}`, 137, 49);

    const cardW = 41;
    const cardH = 15;
    const gap = 5;
    const startY = 67;

    const metrics = [
      { label: 'ATTENDANCE', val: `${daysPresent}P / ${daysHalf}H / ${daysAbsent}A`, highlight: false, color: cZinc950 },
      { label: 'TOTAL EARNED', val: `Rs. ${totalEarned.toLocaleString('en-IN')}`, highlight: false, color: cZinc950 },
      { label: 'TOTAL PAID', val: `Rs. ${totalPaid.toLocaleString('en-IN')}`, highlight: true, color: cEmerald },
      { label: 'REMAINING DUE', val: `Rs. ${remainingToPay.toLocaleString('en-IN')}`, highlight: true, color: cAmber }
    ];

    metrics.forEach((m, idx) => {
      const x = 15 + idx * (cardW + gap);
      if (m.highlight) {
        doc.setFillColor(250, 250, 250);
        doc.setDrawColor(212, 212, 216);
      } else {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(228, 228, 231);
      }
      doc.roundedRect(x, startY, cardW, cardH, 2, 2, 'FD');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
      doc.text(m.label, x + cardW / 2, startY + 5, { align: 'center' });

      doc.setFontSize(11);
      doc.setTextColor(m.color[0], m.color[1], m.color[2]);
      doc.text(m.val, x + cardW / 2, startY + 11, { align: 'center' });
    });

    // 3.5 Attendance Calendar Visualizer Card
    const calStartY = 85;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(228, 228, 231);
    doc.roundedRect(15, calStartY, 180, 26, 2, 2, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
    doc.text('ATTENDANCE CALENDAR', 19, calStartY + 5);

    // Draw Legend
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);

    // Present
    doc.setFillColor(16, 185, 129);
    doc.circle(95, calStartY + 4.5, 1.2, 'F');
    doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
    doc.text('Present', 98, calStartY + 5.5);

    // Half Day
    doc.setFillColor(59, 130, 246);
    doc.circle(120, calStartY + 4.5, 1.2, 'F');
    doc.text('Half Day', 123, calStartY + 5.5);

    // Absent
    doc.setFillColor(239, 68, 68);
    doc.circle(145, calStartY + 4.5, 1.2, 'F');
    doc.text('Absent', 148, calStartY + 5.5);

    // No Log
    doc.setFillColor(244, 244, 245);
    doc.circle(170, calStartY + 4.5, 1.2, 'F');
    doc.text('No Log', 173, calStartY + 5.5);

    // Calculate and draw dots
    let days: Date[] = [];
    if (overviewFilterType === 'weekly') {
      const curr = new Date();
      const dayOffset = curr.getDay();
      const mondayOffset = dayOffset === 0 ? -6 : 1 - dayOffset;
      const start = new Date(curr.setDate(curr.getDate() + mondayOffset + (selectedWeekOffset * 7)));
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
      }
    } else {
      const daysInMonth = new Date(selectedYearVal, selectedMonthVal + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(selectedYearVal, selectedMonthVal, i));
      }
    }

    const dotRadius = 2.2;
    const dotGap = 6.5;
    const dotStartY = calStartY + 14;

    days.forEach((d, i) => {
      const dateStr = formatLocalDate(d);
      const log = attendanceLogs.find(a => a.workerName === worker.name && a.date === dateStr);

      let dotColor = [244, 244, 245];
      let dotBorder = [228, 228, 231];
      let textColor = [113, 113, 122];

      if (log) {
        textColor = [255, 255, 255];
        if (log.status === 'Present') {
          dotColor = [16, 185, 129];
          dotBorder = [16, 185, 129];
        } else if (log.status === 'Half Day') {
          dotColor = [59, 130, 246];
          dotBorder = [59, 130, 246];
        } else if (log.status === 'Absent') {
          dotColor = [239, 68, 68];
          dotBorder = [239, 68, 68];
        }
      }

      const maxDotsPerRow = overviewFilterType === 'weekly' ? 7 : 16;
      const colIdx = i % maxDotsPerRow;
      const rowIdx = Math.floor(i / maxDotsPerRow);

      const dotsInThisRow = Math.min(maxDotsPerRow, days.length - rowIdx * maxDotsPerRow);
      const rowWidth = (dotsInThisRow - 1) * dotGap;
      const startX = 15 + (180 - rowWidth) / 2;

      const x = startX + colIdx * dotGap;
      const y = dotStartY + rowIdx * 6.5;

      doc.setFillColor(dotColor[0], dotColor[1], dotColor[2]);
      doc.setDrawColor(dotBorder[0], dotBorder[1], dotBorder[2]);
      doc.setLineWidth(0.2);
      doc.circle(x, y, dotRadius, 'FD');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text(d.getDate().toString(), x, y + 0.8, { align: 'center' });
    });

    let currentY = 116;

    const drawTableHeader = (y: number) => {
      doc.setFillColor(244, 244, 245);
      doc.rect(15, y, 180, 7, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);

      doc.text('Date', 18, y + 5);
      doc.text('Project', 38, y + 5);
      doc.text('Task Scope', 72, y + 5);
      doc.text('Status', 115, y + 5);
      doc.text('Wage (Rs)', 142, y + 5, { align: 'right' });
      doc.text('OT (Rs)', 158, y + 5, { align: 'right' });
      doc.text('Total (Rs)', 175, y + 5, { align: 'right' });
      doc.text('Payment', 186, y + 5);
    };

    drawTableHeader(currentY);
    currentY += 7;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);

    workerAtt.forEach((a) => {
      if (currentY > 255) {
        doc.addPage();
        currentY = 20;
        drawTableHeader(currentY);
        currentY += 7;
      }

      let wages = 0;
      if (a.status === 'Present') wages = a.dailyWage || worker.dailyWage;
      else if (a.status === 'Half Day') wages = (a.dailyWage || worker.dailyWage) * 0.5;
      const totalRowEarned = wages + (a.overtimeAmount || 0);

      doc.setTextColor(cZinc950[0], cZinc950[1], cZinc950[2]);
      doc.setFont('Helvetica', 'normal');
      doc.text(a.date, 18, currentY + 5);
      doc.text(a.projectName || '—', 38, currentY + 5);
      doc.text(a.taskName || '—', 72, currentY + 5);

      if (a.status === 'Present') {
        doc.setTextColor(cEmerald[0], cEmerald[1], cEmerald[2]);
      } else if (a.status === 'Half Day') {
        doc.setTextColor(30, 64, 175);
      } else {
        doc.setTextColor(cRed[0], cRed[1], cRed[2]);
      }
      doc.setFont('Helvetica', 'bold');
      doc.text(a.status, 115, currentY + 5);

      doc.setTextColor(cZinc950[0], cZinc950[1], cZinc950[2]);
      doc.setFont('Helvetica', 'normal');
      doc.text(wages.toLocaleString('en-IN'), 142, currentY + 5, { align: 'right' });
      doc.text((a.overtimeAmount || 0).toLocaleString('en-IN'), 158, currentY + 5, { align: 'right' });

      doc.setFont('Helvetica', 'bold');
      doc.text(totalRowEarned.toLocaleString('en-IN'), 175, currentY + 5, { align: 'right' });

      const statusVal = a.paymentStatus || 'Unpaid';
      if (statusVal === 'Paid') {
        doc.setTextColor(cEmerald[0], cEmerald[1], cEmerald[2]);
      } else if (statusVal === 'Pending') {
        doc.setTextColor(cAmber[0], cAmber[1], cAmber[2]);
      } else {
        doc.setTextColor(cZinc500[0], cZinc500[1], cZinc500[2]);
      }
      doc.text(statusVal, 186, currentY + 5);

      doc.setDrawColor(244, 244, 245);
      doc.setLineWidth(0.3);
      doc.line(15, currentY + 7, 195, currentY + 7);

      currentY += 7;
    });

    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    currentY += 20;
    doc.setDrawColor(161, 161, 170);
    doc.setLineWidth(0.3);
    doc.line(20, currentY, 75, currentY);
    doc.line(135, currentY, 190, currentY);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(cZinc700[0], cZinc700[1], cZinc700[2]);
    doc.text('Worker Signature', 47, currentY + 5, { align: 'center' });
    doc.text('Authorized Signature', 162, currentY + 5, { align: 'center' });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(cZinc500[0], cZinc500[1], cZinc500[2]);
      doc.text('Pro26 Software Solutions', 15, 287);
      doc.text(`Page ${i} of ${pageCount}`, 195, 287, { align: 'right' });
    }

    savePdf(doc, `report_${worker.name.toLowerCase().replace(/\s+/g, '_')}_${startStr}_to_${endStr}.pdf`);
    notify.success('PDF report downloaded successfully.');
  } catch (pdfErr) {
    console.error('PDF Generation Error:', pdfErr);
    notify.error('Failed to generate PDF report.');
  }
};
