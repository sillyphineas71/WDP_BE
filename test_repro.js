import { quizExportService } from './src/services/quizExportService.js';
import sequelize from './src/config/database.js';
import { initModels } from './src/models/index.js';

async function test() {
    initModels(sequelize);
    try {
        console.log('Testing generatePDF...');
        // Mocking quizId if you don't have one, or just check if the function can be called
        // Actually we just want to see if the variable is in scope
        console.log('Function type:', typeof quizExportService.generatePDF);
        
        // We can try to call it with a fake ID to see if it hits the ReferenceError or a NotFound error
        try {
            await quizExportService.generatePDF(999999, true);
        } catch (e) {
            console.log('PDF Error (expected):', e.message);
            if (e.message.includes('optionsLabels')) {
                console.error('FAILED: optionsLabels is not defined in PDF');
            }
        }

        console.log('Testing generateDocx...');
        try {
            await quizExportService.generateDocx(999999, true);
        } catch (e) {
            console.log('Docx Error (expected):', e.message);
            if (e.message.includes('optionsLabels')) {
                console.error('FAILED: optionsLabels is not defined in Docx');
            }
        }
        
    } catch (err) {
        console.error('Fatal test error:', err);
    } finally {
        await sequelize.close();
    }
}

test();
