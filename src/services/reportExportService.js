import PDFDocument from 'pdfkit';

export const reportExportService = {
    generateReportPDF: async (reportData, filters, teacherActivityData) => {
        const doc = new PDFDocument({ margin: 50 });
        
        // Register Vietnamese fonts
        try {
            doc.registerFont('Arial', 'C:/Windows/Fonts/arial.ttf');
            doc.registerFont('Arial-Bold', 'C:/Windows/Fonts/arialbd.ttf');
            doc.registerFont('Arial-Italic', 'C:/Windows/Fonts/ariali.ttf');
            doc.font('Arial');
        } catch (e) {
            console.error('Lỗi nạp font Arial:', e.message);
        }

        const isTeacherReport = filters.activeTab === 'teacher';

        // Title
        const title = isTeacherReport ? 'BÁO CÁO HOẠT ĐỘNG GIẢNG DẠY (v2)' : 'BÁO CÁO & PHÂN TÍCH ĐIỂM SỐ (v2)';
        doc.font('Arial-Bold').fontSize(20).text(title, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Arial-Italic').text(`Ngày tạo: ${new Date().toLocaleString('vi-VN')}`, { align: 'center' });
        doc.moveDown();

        // Filters Info
        doc.font('Arial-Bold').fontSize(12).text('Thông tin bộ lọc:');
        doc.font('Arial').fontSize(11);
        doc.text(`- Học kỳ: ${filters.semester || 'Tất cả'}`);
        doc.text(`- Môn học: ${filters.course || 'Tất cả'}`);
        doc.text(`- Lớp học: ${filters.className || 'Tất cả'}`);
        doc.text(`- Khoảng thời gian: ${filters.dateRange || 'Mặc định'}`);
        doc.moveDown();

        if (isTeacherReport && teacherActivityData) {
            // Teacher Activity Sections
            doc.font('Arial-Bold').fontSize(14).text('1. Tổng hợp hoạt động');
            doc.moveDown(0.5);
            doc.font('Arial').fontSize(11);
            const t = teacherActivityData.totals || { quizzesCreated: 0, materialsUploaded: 0, assignmentsGraded: 0 };
            doc.text(`- Bài trắc nghiệm đã tạo: ${t.quizzesCreated}`);
            doc.text(`- Tài liệu đã tải lên: ${t.materialsUploaded}`);
            doc.text(`- Bài tập đã chấm điểm: ${t.assignmentsGraded}`);
            doc.moveDown();

            doc.font('Arial-Bold').fontSize(14).text('2. Diễn biến hoạt động theo thời gian');
            doc.moveDown(0.5);
            
            // Header for activity table
            doc.fontSize(10).font('Arial-Bold');
            doc.text('Giai đoạn', 70, doc.y, { continued: true });
            doc.text('Trắc nghiệm', 180, doc.y, { continued: true });
            doc.text('Tài liệu', 280, doc.y, { continued: true });
            doc.text('Chấm điểm', 380, doc.y);
            doc.moveTo(70, doc.y + 2).lineTo(500, doc.y + 2).stroke();
            doc.moveDown(0.5);

            doc.font('Arial').fontSize(10);
            (teacherActivityData.activityChartData || []).forEach(item => {
                doc.text(item.name || '?', 70, doc.y, { continued: true });
                doc.text(String(item.quizzesCreated || 0), 180, doc.y, { continued: true });
                doc.text(String(item.materialsUploaded || 0), 280, doc.y, { continued: true });
                doc.text(String(item.assignmentsGraded || 0), 380, doc.y);
                doc.moveDown(0.2);
            });

        } else {
            // Standard Grade Distribution Report
            // Summary Statistics Section
            doc.font('Arial-Bold').fontSize(14).text('1. Thống kê tổng quan');
            doc.moveDown(0.5);
            const stats = reportData?.summaryStats || { avgGrade: 'N/A', passRate: 0, totalStudents: 0, aPercent: 0, aStudents: 0, gradeTotal: 0 };
            doc.font('Arial').fontSize(11);
            doc.text(`- Điểm trung bình: ${stats.avgGrade}`);
            doc.text(`- Tỷ lệ đạt: ${stats.passRate}%`);
            doc.text(`- Tổng số học sinh: ${stats.totalStudents}`);
            doc.text(`- Tỷ lệ học sinh loại A: ${stats.aPercent}% (${stats.aStudents}/${stats.gradeTotal} đầu điểm)`);
            doc.moveDown();

            // Grade Distribution Section
            doc.font('Arial-Bold').fontSize(14).text('2. Phân bố xếp loại');
            doc.moveDown(0.5);
            
            doc.font('Arial-Bold').fontSize(10);
            doc.text('Xếp loại', 70, doc.y, { continued: true });
            doc.text('Số lượng học sinh', 150, doc.y);
            doc.font('Arial').fontSize(10);
            doc.moveTo(70, doc.y).lineTo(300, doc.y).stroke();
            doc.moveDown(0.2);

            (reportData?.gradeDistributionData || []).forEach(item => {
                doc.text(item.name || '?', 70, doc.y, { continued: true });
                doc.text(String(item.students || 0), 150, doc.y);
                doc.moveDown(0.1);
            });
            doc.moveDown();

            // Detailed Data Section
            doc.addPage();
            doc.font('Arial-Bold').fontSize(14).text('3. Danh sách chi tiết điểm số');
            doc.moveDown(0.5);

            const startY = doc.y;
            doc.fontSize(10).font('Arial-Bold');
            doc.text('Học sinh', 50, startY);
            doc.text('Lớp', 180, startY);
            doc.text('Mã môn', 280, startY);
            doc.text('Điểm', 360, startY);
            doc.text('Xếp loại', 420, startY);
            
            doc.moveTo(50, startY + 15).lineTo(500, startY + 15).stroke();
            doc.font('Arial').fontSize(9);
            let currentY = startY + 25;

            (reportData?.detailedData || []).forEach((student, index) => {
                if (currentY > 700) {
                    doc.addPage();
                    currentY = 50;
                    doc.fontSize(10).font('Arial-Bold');
                    doc.text('Học sinh', 50, currentY);
                    doc.text('Lớp', 180, currentY);
                    doc.text('Mã môn', 280, currentY);
                    doc.text('Điểm', 360, currentY);
                    doc.text('Xếp loại', 420, currentY);
                    doc.moveTo(50, currentY + 15).lineTo(500, currentY + 15).stroke();
                    doc.font('Arial').fontSize(9);
                    currentY += 25;
                }

                doc.text(student.student_name || 'N/A', 50, currentY);
                doc.text(student.class_name || 'N/A', 180, currentY);
                doc.text(student.course_code || 'N/A', 280, currentY);
                doc.text(String(student.score || 0), 360, currentY);
                doc.text(student.grade_letter || 'N/A', 420, currentY);
                currentY += 15;
            });
        }

        return doc;
    }
};
