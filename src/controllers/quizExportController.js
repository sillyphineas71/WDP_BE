import { quizExportService } from "../services/quizExportService.js";

export const quizExportController = {
    exportQuiz: async (req, res, next) => {
        try {
            const { quizId } = req.params;
            const { format, includeAnswers } = req.query; // format: 'pdf' | 'docx'
            const isWithAnswers = includeAnswers === 'true';

            if (format === 'pdf') {
                const doc = await quizExportService.generatePDF(quizId, isWithAnswers);
                
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=quiz_${quizId}.pdf`);
                
                doc.pipe(res);
                doc.end();
            } else if (format === 'docx') {
                const buffer = await quizExportService.generateDocx(quizId, isWithAnswers);
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename=quiz_${quizId}.docx`);
                
                res.send(buffer);
            } else {
                res.status(400).json({ success: false, message: 'Định dạng không hợp lệ' });
            }
        } catch (error) {
            next(error);
        }
    }
};
