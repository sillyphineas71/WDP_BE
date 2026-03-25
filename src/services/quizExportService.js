import PDFDocument from 'pdfkit';
import { 
    Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, 
    Table, TableRow, TableCell, WidthType, BorderStyle 
} from 'docx';
import { Assessment } from '../models/Assessment.js';
import { QuizQuestion } from '../models/QuizQuestion.js';
import { QuizOption } from '../models/QuizOption.js';
import { Class } from '../models/Class.js';
import { Course } from '../models/Course.js';

const QUIZ_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const quizExportService = {
    getQuizData: async (quizId) => {
        const quiz = await Assessment.findByPk(quizId, {
            include: [
                {
                    model: QuizQuestion,
                    as: 'questions',
                    include: [{ model: QuizOption, as: 'options', order: [['display_order', 'ASC']] }],
                    order: [['display_order', 'ASC']]
                },
                {
                    model: Class,
                    as: 'class',
                    include: [{ model: Course, as: 'course' }]
                }
            ]
        });
        return quiz;
    },

    processLaTeX: (text) => {
        if (!text) return '';
        let processed = text;
        
        // 1. Xử lý phân số \frac{a}{b} -> a/b
        while (processed.includes('\\frac')) {
            const match = processed.match(/\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/);
            if (match) {
                processed = processed.replace(match[0], `${match[1]}/${match[2]}`);
            } else {
                break; 
            }
        }

        // 2. Chuyển đổi các ký hiệu phổ biến
        const symbolMap = {
            '\\\\times': '×',
            '\\\\div': '÷',
            '\\\\pm': '±',
            '\\\\ge': '≥',
            '\\\\le': '≤',
            '\\\\neq': '≠',
            '\\\\approx': '≈',
            '\\\\infty': '∞',
            '\\\\cdot': '·',
            '\\\\sqrt': '√',
            '\\\\pi': 'π',
            '\\\\alpha': 'α',
            '\\\\beta': 'β',
            '\\\\gamma': 'γ',
            '\\\\delta': 'δ',
            '\\\\theta': 'θ',
            '\\\\sigma': 'σ',
            '\\\\Delta': 'Δ',
            '\\\\degree': '°'
        };

        for (const [key, value] of Object.entries(symbolMap)) {
            const regex = new RegExp(key, 'g');
            processed = processed.replace(regex, value);
        }

        // 3. Số mũ & Chỉ số dưới đơn giản
        processed = processed.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\^n/g, 'ⁿ');
        processed = processed.replace(/\^\{\s*2\s*\}/g, '²').replace(/\^\{\s*3\s*\}/g, '³');
        processed = processed.replace(/_1/g, '₁').replace(/_2/g, '₂').replace(/_n/g, 'ₙ');

        // 4. Xóa LaTeX markers và làm sạch
        return processed.replace(/\$\$/g, '').replace(/\$/g, '').trim();
    },

    cleanText: (text) => {
        return quizExportService.processLaTeX(text);
    },

    getCleanInstructions: (instructions) => {
        if (!instructions) return '';
        const index = instructions.search(/\[quiz_settings\]/i);
        if (index !== -1) {
            let clean = instructions.substring(0, index).trim();
            return clean.replace(/[-\s]+$/, '').trim();
        }
        return instructions.trim();
    },

    generatePDF: async (quizId, includeAnswers = false) => {
        const quiz = await quizExportService.getQuizData(quizId);
        if (!quiz) throw new Error('Không tìm thấy Quiz');

        const doc = new PDFDocument({ margin: 50 });
        
        try {
            doc.registerFont('Arial', 'C:/Windows/Fonts/arial.ttf');
            doc.registerFont('Arial-Bold', 'C:/Windows/Fonts/arialbd.ttf');
            doc.registerFont('Arial-Italic', 'C:/Windows/Fonts/ariali.ttf');
            doc.font('Arial');
        } catch (e) {
            console.error('Lỗi nạp font Arial:', e.message);
        }
        
        doc.font('Arial-Bold').fontSize(11);
        doc.text('TRƯỜNG/TRUNG TÂM: ..............................', 50, 50);
        doc.text('BÀI THI: ' + (quiz.title || '').toUpperCase(), 350, 50);
        
        doc.font('Arial').fontSize(10);
        const courseName = quiz.class?.course?.name || '';
        const courseCode = quiz.class?.course?.code || '';
        doc.text(`Môn học: ${courseName} ${courseCode ? '('+courseCode+')' : ''}`, 50, 65);
        doc.text(`Thời gian: ${quiz.time_limit_minutes || '--'} phút`, 350, 65);
        
        doc.text(`Lớp: ${quiz.class?.name || ''}`, 50, 80);
        doc.text(`Mã đề: .......`, 350, 80);

        doc.moveDown(2);
        doc.font('Arial-Italic').fontSize(11);
        doc.text('SBD: ................   Họ và tên thí sinh: .................................................', 50, 105);
        
        doc.moveTo(50, 125).lineTo(550, 125).stroke();
        doc.moveDown(1);

        const instructions = quizExportService.getCleanInstructions(quiz.instructions);
        if (instructions) {
            doc.font('Arial-Italic').fontSize(10).text(`* Hướng dẫn: ${instructions}`, 50, 130, { width: 500 });
            doc.moveDown(1);
        }

        let currentY = doc.y + 10;
        quiz.questions?.forEach((q, index) => {
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
            }

            const qText = quizExportService.cleanText(q.question_text);
            doc.font('Arial-Bold').fontSize(11).text(`Câu ${index + 1}: `, 50, currentY, { continued: true })
               .font('Arial').text(`${qText} (${q.points} điểm)`);
            
            currentY = doc.y + 5;
            const opts = q.options || [];
            const maxOptLength = Math.max(...opts.map(o => (o.option_text || '').length));
            const useTwoColumns = maxOptLength < 30 && opts.length <= 4;

            if (useTwoColumns) {
                opts.forEach((opt, optIdx) => {
                    const label = QUIZ_OPTION_LABELS[optIdx] || (optIdx + 1);
                    const optText = quizExportService.cleanText(opt.option_text);
                    let text = `${label}. ${optText}`;
                    
                    const isCorrect = includeAnswers && opt.is_correct;
                    if (isCorrect) {
                        doc.font('Arial-Bold');
                    } else {
                        doc.font('Arial');
                    }
                    
                    const col = optIdx % 2;
                    const row = Math.floor(optIdx / 2);
                    const x = 70 + col * 240;
                    const y = currentY + row * 18;
                    
                    doc.fontSize(10).text(text, x, y, { width: 230 });
                    if (col === 1 || optIdx === opts.length - 1) {
                        doc.y = y + 18;
                    }
                });
                doc.font('Arial');
                currentY = doc.y + 10;
            } else {
                opts.forEach((opt, optIdx) => {
                    const label = QUIZ_OPTION_LABELS[optIdx] || (optIdx + 1);
                    const optText = quizExportService.cleanText(opt.option_text);
                    let text = `${label}. ${optText}`;
                    
                    const isCorrect = includeAnswers && opt.is_correct;
                    if (isCorrect) {
                        doc.font('Arial-Bold');
                    } else {
                        doc.font('Arial');
                    }
                    
                    doc.fontSize(10).text(text, 70, currentY, { width: 480 });
                    currentY = doc.y + 5;
                });
                doc.font('Arial');
                currentY += 5;
            }

            if (includeAnswers) {
                const correctOpt = q.options?.find(o => o.is_correct);
                const correctIdx = q.options?.indexOf(correctOpt);
                const correctLabel = correctIdx !== -1 ? (QUIZ_OPTION_LABELS[correctIdx] || correctIdx + 1) : 'N/A';
                doc.font('Arial-Bold').fontSize(10).text(`=> Đáp án đúng: ${correctLabel}`, 50, currentY);
                currentY = doc.y + 10;
            }

            doc.moveDown(0.5);
            currentY = doc.y;
        });

        return doc;
    },

    generateDocx: async (quizId, includeAnswers = false) => {
        const quiz = await quizExportService.getQuizData(quizId);
        if (!quiz) throw new Error('Không tìm thấy Quiz');

        const children = [
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
                    insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
                },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                width: { size: 50, type: WidthType.PERCENTAGE },
                                children: [
                                    new Paragraph({ text: 'TRƯỜNG/TRUNG TÂM: ..............................', size: 22 }),
                                    new Paragraph({ text: `Môn học: ${quiz.class?.course?.name || ''}`, size: 22 }),
                                    new Paragraph({ text: `Lớp: ${quiz.class?.name || ''}`, size: 22 }),
                                ],
                            }),
                            new TableCell({
                                width: { size: 50, type: WidthType.PERCENTAGE },
                                children: [
                                    new Paragraph({ text: 'BÀI THI: ' + (quiz.title || '').toUpperCase(), alignment: AlignmentType.CENTER, bold: true, size: 22 }),
                                    new Paragraph({ text: `Thời gian: ${quiz.time_limit_minutes || '--'} phút`, alignment: AlignmentType.CENTER, size: 22 }),
                                    new Paragraph({ text: 'Mã đề: .......', alignment: AlignmentType.CENTER, size: 22 }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
            new Paragraph({ text: '', spacing: { before: 200, after: 200 } }),
            new Paragraph({
                children: [new TextRun({ text: 'SBD: ................   Họ và tên thí sinh: .................................................................', size: 22, italic: true })],
            }),
            new Paragraph({ text: '', border: { bottom: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 } } }),
        ];

        const instructions = quizExportService.getCleanInstructions(quiz.instructions);
        if (instructions) {
            children.push(new Paragraph({
                children: [new TextRun({ text: `Hướng dẫn: ${instructions}`, italic: true, size: 20 })],
                spacing: { before: 200, after: 200 },
            }));
        }

        quiz.questions?.forEach((q, index) => {
            const qText = quizExportService.cleanText(q.question_text);
            children.push(new Paragraph({
                children: [
                    new TextRun({ text: `Câu ${index + 1}: `, bold: true, size: 24 }),
                    new TextRun({ text: `${qText} (${q.points} điểm)`, size: 24 }),
                ],
                spacing: { before: 400, after: 200 },
            }));

            const opts = q.options || [];
            const maxOptLength = Math.max(...opts.map(o => (o.option_text || '').length));
            const useTwoColumns = maxOptLength < 30 && opts.length <= 4;

            if (useTwoColumns) {
                const rows = [];
                for (let i = 0; i < opts.length; i += 2) {
                    const rowCells = [];
                    const opt1 = opts[i];
                    const label1 = QUIZ_OPTION_LABELS[i];
                    const optText1 = quizExportService.cleanText(opt1.option_text);
                    const isCorr1 = includeAnswers && opt1.is_correct;
                    let text1 = `${label1}. ${optText1}`;
                    
                    rowCells.push(new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: text1, size: 22, bold: isCorr1 })] })],
                        borders: { top: {style: BorderStyle.NONE}, bottom: {style: BorderStyle.NONE}, left: {style: BorderStyle.NONE}, right: {style: BorderStyle.NONE} }
                    }));

                    if (i + 1 < opts.length) {
                        const opt2 = opts[i + 1];
                        const label2 = QUIZ_OPTION_LABELS[i + 1];
                        const optText2 = quizExportService.cleanText(opt2.option_text);
                        const isCorr2 = includeAnswers && opt2.is_correct;
                        let text2 = `${label2}. ${optText2}`;
                        rowCells.push(new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: text2, size: 22, bold: isCorr2 })] })],
                            borders: { top: {style: BorderStyle.NONE}, bottom: {style: BorderStyle.NONE}, left: {style: BorderStyle.NONE}, right: {style: BorderStyle.NONE} }
                        }));
                    } else {
                        rowCells.push(new TableCell({ children: [], borders: { top: {style: BorderStyle.NONE}, bottom: {style: BorderStyle.NONE}, left: {style: BorderStyle.NONE}, right: {style: BorderStyle.NONE} } }));
                    }
                    rows.push(new TableRow({ children: rowCells }));
                }
                children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows }));
            } else {
                opts.forEach((opt, optIdx) => {
                    const label = QUIZ_OPTION_LABELS[optIdx] || (optIdx + 1);
                    const optText = quizExportService.cleanText(opt.option_text);
                    const isCorrect = includeAnswers && opt.is_correct;
                    let text = `${label}. ${optText}`;
                    children.push(new Paragraph({
                        children: [new TextRun({ text: text, size: 22, bold: isCorrect })],
                        indent: { left: 720 },
                    }));
                });
            }

            if (includeAnswers) {
                const correctOpt = q.options?.find(o => o.is_correct);
                const correctIdx = q.options?.indexOf(correctOpt);
                const correctLabel = correctIdx !== -1 ? (QUIZ_OPTION_LABELS[correctIdx] || correctIdx + 1) : 'N/A';
                children.push(new Paragraph({
                    children: [new TextRun({ text: `=> Đáp án đúng: ${correctLabel}`, bold: true, size: 22, color: "FF0000" })],
                    spacing: { before: 200 },
                }));
            }
        });

        const doc = new Document({ sections: [{ properties: {}, children: children }] });
        return await Packer.toBuffer(doc);
    }
};
