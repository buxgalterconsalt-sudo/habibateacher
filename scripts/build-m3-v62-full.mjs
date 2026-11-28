import fs from 'node:fs';
import path from 'node:path';

const target = path.join(import.meta.dirname, '..', 'seed-data', 'tkt-practice-tests.json');
const bank = JSON.parse(fs.readFileSync(target, 'utf8'));
const q = (text, options, correct) => ({ text, options, correct: typeof correct === 'number' ? correct : options.indexOf(correct), passage: '' });
const keyIndex = (letters, letter) => letters.indexOf(letter.toUpperCase());
const matching = (range, stems, labels, key, heading) => stems.map((stem, i) => q(`${heading}: ${stem}`, labels, keyIndex(labels.map((_, n) => String.fromCharCode(65+n)), key[i])));
const questions = [];

const f16 = ['Clarifying','Giving instructions','Narrating','Modelling','Prompting a learner to continue','Eliciting language','Checking understanding'];
questions.push(...matching('1-6', [
  '“That’s right, he’s wearing a jacket. Are jackets normally long or short?”',
  '“Then the three friends woke up and continued their journey.”',
  '“You like that picture. Can you tell your partner why you like it?”',
  '“Stop writing now and pass your paper to the person on your left.”',
  '“A quarter past three is the same as three fifteen.”',
  '“What clothes do you normally only wear in cold weather? Any suggestions?”'
], f16, 'GCEBAF', 'Teacher classroom language function'));

const notAppropriate = [
  ['A teacher asks learners to look at a text after a short pre-reading task. Which is NOT appropriate?', ['Read carefully and tell me the gist.','Check whether your predictions were correct.','Read quickly and choose the best title.'], 'B'],
  ['A teacher uses a picture to interest elementary learners in a topic. Which suggestion is NOT appropriate?', ['Say where you think the picture is.','Answer questions with a partner.','Speculate about what the people have been doing.'], 'C'],
  ['A pre-intermediate learner asks if she can express a sentence another way. Which response is NOT appropriate?', ['It is highly unlikely anyone would express it that way.','It will not be very clear what you mean.','You can, but it sounds too formal.'], 'A'],
  ['A teacher checks whether learners remember “safe”. Which question is NOT appropriate?', ['Give a word opposite in meaning to safe.','Where did we see safe yesterday?','You have all seen safe before. Do you understand it?'], 'B'],
  ['Learners write a complaint to a bank manager. Which advice is NOT appropriate?', ['Check paragraphs and linking words in the final draft.','Register is unimportant if the complaint is clear.','Focus on communicating the complaint in the first draft.'], 'B'],
  ['Learners struggle to say “atmosphere”. Which support is NOT appropriate?', ['Listen and identify the word stress.','Notice that ph is pronounced /f/, as in enough.','Guess how to spell the word because it is difficult.'], 'C'],
  ['A teacher focuses on vocabulary learners will meet in a text. Which is NOT an appropriate activity?', ['Guess meanings and create definitions.','Match words in the text to meanings below.','Underline unknown words and check whether context or a partner helps.'], 'B']
];
for (const [text, options, key] of notAppropriate) questions.push(q(text, options, keyIndex(['A','B','C'], key)));

const abc = ['A','B','C'];
questions.push(...matching('14-19', [
  'Focus learners on the topic before they listen to an interview.',
  'Check that learners understand grammar points during a presentation.',
  'Get learners to share ideas before a speaking activity.',
  'Check learners are following the instructions given.',
  'Help learners understand key words before they read a text.',
  'Observe learners so you can give feedback after a speaking activity.'
], ['A. Asking concept questions','B. Brainstorming','C. Monitoring'], 'BABCBC', 'Teacher activity'));

const err20 = ['A. Verb form','B. Spelling','C. Articles','D. Punctuation'];
questions.push(...matching('20-26', [
  '“I like to introduce my town to you.”',
  '“the huge park in centre”',
  '“for most of the year, so everybody ...” (the missing comma after year)',
  '“some of children’s games”',
  '“its nice that ice-cream is available”',
  '“the park authoritys”',
  '“Now I’m to busy to go to the park”'
], err20, 'ACDCDBB', 'Type of writing error'));

const f27 = ['A. Asking for clarification','B. Giving an example','C. Giving yourself time to think','D. Including someone','E. Interrupting to make a point','F. Accepting a different opinion','G. Prioritising a task','H. Disagreeing'];
questions.push(...matching('27-33', [
  '“We are going to write a description, right? But now we have to just talk and brainstorm ideas.”',
  '“We could use headings, like buildings, shops, restaurants and sightseeing.”',
  '“Are we supposed to talk about our home town or the town we study in?”',
  '“The teacher said we could choose, but I think the town we study in, so we can all contribute.”',
  '“Actually, I think it would be better to talk about our home towns. We would have more to say.”',
  '“Umm, I suppose so. We’ll talk about our home towns.”',
  '“What are the main attractions in your town, Suzanne?”'
], f27, 'GBACHFD', 'Function of learner language'));

const f34 = ['A. Requesting information','B. Giving advice','C. Asking for an opinion','D. Confirming facts','E. Speculating','F. Negotiating','G. Offering a solution','H. Suggesting a sequence'];
questions.push(...matching('34-40', [
  '“As you know, we are having a party for Martin on Saturday, at my house in the garden.”',
  '“It would be a good idea to bring a sweater.”',
  '“We can go shopping, decorate the house and then prepare the food.”',
  '“That rice dish is delicious; I expect everyone will love it.”',
  '“We will not have enough plates, but we can buy paper ones.”',
  '“I have lots of CDs. Is that enough, do you think? Mark is bringing music too.”',
  '“What time does your gym lesson finish on Saturday?”'
], f34, 'DBHEGCA', 'Function of written learner language'));

const q41 = [
  ['Why can a quiet period in a lesson be useful?',['A change of pace can help learning.','Learners need quiet time to consolidate learning.','The teacher can prepare the next activity.'],'C'],
  ['Are definitions always the best way to explain vocabulary?',['They can be more complex than the word.','They may not be memorable.','Learners can be encouraged to write their own definitions.'],'A'],
  ['Why should learners personalise new language?',['They dislike unfamiliar topics.','They remember language when it relates to real life.','Personalising can be more motivating.'],'A'],
  ['Why should teachers learn about their learners?',['To be aware of sensitive areas.','To treat them as individuals.','To discuss personal issues in class.'],'C'],
  ['Should feedback be given after every task?',['Feedback can make the task more meaningful.','Go through answers even when you know they are correct.','Feedback can give learners a sense of progress.'],'B'],
  ['Do teachers need to follow everything in a lesson plan?',['An activity may no longer be necessary.','Unpredicted problems may need attention.','Learners may find controlled practice boring.'],'C'],
  ['Why vary the tone and speed of your voice?',['It prevents learners becoming bored and stopping listening.','It makes it easier for learners to copy you.','Changes in voice can support meaning.'],'A']
];
for (const [text, options, key] of q41) questions.push(q(`${text} Choose the trainee response that is NOT appropriate.`, options, keyIndex(abc, key)));

const f48 = ['A. Ask learners to demonstrate the task.','B. Nominate monitors to ensure turn-taking.','C. Group learners of similar ability.','D. Prepare a seating plan.','E. Explain that learners can learn from each other.','F. Use pair work to encourage less confident learners.','G. Plan board work in advance.','H. Bring a backup game or quiz.'];
questions.push(...matching('48-54', [
  'Some learners find it difficult to speak in front of the whole class.',
  'Some learners fail group activities because they have not listened carefully to instructions.',
  'A neighbouring teacher complains that your class is too noisy.',
  'Learners do not see the point of student-centred activities.',
  'Stronger learners are not challenged enough in group work.',
  'Learners finish tasks early and there is time before the lesson ends.',
  'You cannot remember all the learners’ names.'
], f48, 'FABE CHD'.replace(/ /g,''), 'Classroom management response'));

const f55 = ['A. Planner','B. Manager','C. Assessor','D. Contributor'];
questions.push(...matching('55-61', [
  'After class, the teacher talks to individual learners about their progress.',
  'While monitoring pair work, the teacher explains why she agrees with learners’ opinions.',
  'The teacher stops controlled practice when learners start using L1.',
  'The teacher asks a learner to repeat the instructions.',
  'The teacher invites learners to ask for his views in a discussion.',
  'The teacher checks that noisy groups do not distract others.',
  'The teacher brings photocopied news articles to class.'
], f55, 'CDBCD BA'.replace(/ /g,''), 'Teacher role'));

const f62 = ['A. Assess negotiating skills','B. Encourage peer feedback','C. Build confidence in functional language','D. Competitive language review','E. Build rapport','F. Quiet thinking time','G. Share known language'];
questions.push(...matching('62-67', [
  'Learners individually brainstorm words for city and countryside.',
  'The class chorally drills advice structures before a role-play.',
  'The class brainstorms vocabulary for describing people before describing family photos.',
  'Learners show written work to a partner and discuss it before handing it in.',
  'Two teams compete in a quiz on job vocabulary.',
  'The teacher uses many mingling activities in the first lessons with a new class.'
], f62, 'FCGBDE', 'Purpose of interaction pattern'));

const f68 = ['A. Remedial practice','B. Prompting self-correction','C. Explaining the error'];
questions.push(...matching('68-73', [
  'The teacher uses fingers to show where a mistake was made.',
  'The teacher drills words containing the target sounds.',
  'The teacher notes errors in a role-play and explains what was wrong and why in the next lesson.',
  'The teacher uses a correction code on essays.',
  'The teacher draws a timeline and reminds a learner not to use present perfect with past-time expressions.',
  'The teacher echoes “I’ll give it to him when I will see him!” to prompt correction.'
], f68, 'BACBCB', 'Correction strategy'));

const f74 = ['A. Progress','B. Text organisation','C. Accuracy','D. Range'];
questions.push(...matching('74-80', [
  '“Include a strong opening and link ideas together more.”',
  '“A well-balanced argument; remember to allow time to check your work.”',
  '“Good use of adverbs such as however to link paragraphs.”',
  '“Try not to use the same adjectives too often.”',
  '“Your handwriting is getting easier to read.”',
  '“Use synonyms to avoid repeating the same words.”',
  '“Use the irregular verb list to check your work.”'
], f74, 'BCDBADC', 'Feedback focus'));

const invalid = questions.findIndex(x => x.correct < 0 || x.correct >= x.options.length);
if (questions.length !== 80 || invalid >= 0) throw new Error(`Invalid build: ${questions.length} questions; invalid item ${invalid + 1}: ${questions[invalid]?.text}`);
const quiz = {
  module: 3,
  title: 'TKT Module 3 · M3 V62 Full Test (80 questions)',
  source: 'User-provided M3 V62 PDF; all 80 questions adapted to interactive format and answers checked against the paper content',
  duration_min: 80,
  questions
};
const retained = bank.filter(x => x.module !== 3 || !/Additional Practice Test|M3 V62 Source Test/.test(x.title));
retained.push(quiz);
fs.writeFileSync(target, JSON.stringify(retained, null, 2) + '\n');
console.log(`Wrote ${questions.length} questions for M3 V62`);
