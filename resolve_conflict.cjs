const fs = require('fs');

let data = fs.readFileSync('src/services/teacherService.js', 'utf8');

// Normalize newlines to \n
data = data.replace(/\r\n/g, '\n');

// 1. imports resolution
data = data.replace(
`<<<<<<< HEAD
import { Op } from "sequelize";
import { sequelize, Class, Assessment, Course, AssessmentFile, Submission, SubmissionFile, Grade, User, ClassSession, Enrollment } from "../models/index.js";
=======
import { sequelize, Class, Assessment, Course, AssessmentFile, Submission, SubmissionFile, SubmissionAnswer, Grade, User, QuizQuestion, QuizOption, Enrollment, Notification } from "../models/index.js";
>>>>>>> nam-branch`, 
`import { Op } from "sequelize";
import { sequelize, Class, Assessment, Course, AssessmentFile, Submission, SubmissionFile, SubmissionAnswer, Grade, User, ClassSession, QuizQuestion, QuizOption, Enrollment, Notification } from "../models/index.js";`
);

let parts = data.split('<<<<<<< HEAD\n');
if (parts.length === 3) {
    // Interleaved conflicts logic
    let p1 = parts[1].split('=======\n');
    let head2 = p1[0];
    let rest1 = p1[1].split('>>>>>>> nam-branch\n');
    let other2 = rest1[0];
    let common = rest1[1];
    
    let p2 = parts[2].split('=======\n');
    let head3 = p2[0];
    let rest2 = p2[1].split('>>>>>>> nam-branch\n');
    let other3 = rest2[0];
    let tail = rest2[1];
    
    // Sometimes there is no trailing newline before >>>>>>> or ======= if matched exactly,
    // so let's be careful. The split might leave trailing newlines in head2, etc.
    let resolved = parts[0] + 
                   head2 + common + head3 + 
                   ",\n" + 
                   other2 + common + other3 + 
                   tail;
                   
    fs.writeFileSync('src/services/teacherService.js', resolved, 'utf8');
    console.log("Successfully resolved interleaved conflicts.");
} else {
    console.log("Unexpected number of conflicts after imports check: " + (parts.length - 1));
}
