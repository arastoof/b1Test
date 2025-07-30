import { getAllSessions, getAnswersForSession } from './db.js'; 

document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const sessionsContainer = document.getElementById('sessions-container');
    const answersContainer = document.getElementById('answers-container');
    const answerListSection = document.getElementById('answer-list-section');
    const currentSessionIdSpan = document.getElementById('current-session-id');
    const answerDetailSection = document.getElementById('answer-detail-section');
    const detailQuestionType = document.getElementById('detail-question-type');
    const detailQuestionPrompt = document.getElementById('detail-question-prompt');
    const questionAssetContainer = document.getElementById('question-asset-container');
    const detailAnswerAudio = document.getElementById('detail-answer-audio');
    const detailTimestamp = document.getElementById('detail-timestamp');
    const instructionAudio = document.getElementById('instruction-audio');
    const storySection = document.getElementById('story-detail-section');
    const storyPrompt = document.getElementById('detail-story-prompt');
    const storyAssetContainer = document.getElementById('story-asset-container');
    
    // This will hold the answers for the currently selected session
    let currentSessionAnswers = [];

    /**
     * Load all unique test sessions from IndexedDB on page load.
     */
    async function loadSessions() {
        sessionsContainer.innerHTML = '<li>Loading...</li>';
        try {
            const sessions = await getAllSessions();
            sessionsContainer.innerHTML = ''; // Clear loading message

            if (sessions.length === 0) {
                sessionsContainer.innerHTML = '<li>No saved sessions found.</li>';
                return;
            }

            sessions.forEach(session => {
                const li = document.createElement('li');
                li.dataset.sessionId = session.id;
                li.textContent = `${session.startTime} (${session.id})`;
                sessionsContainer.appendChild(li);
            });
        } catch (error) {
            console.error('Error loading sessions:', error);
            sessionsContainer.innerHTML = '<li>Error loading sessions.</li>';
        }
    }

    /**
     * Event handler for clicking on a session in the list.
     */
    sessionsContainer.addEventListener('click', async (event) => {
        if (event.target.tagName !== 'LI' || !event.target.dataset.sessionId) return;

        const sessionId = event.target.dataset.sessionId;
        currentSessionIdSpan.textContent = sessionId;
        answerListSection.classList.remove('hidden');
        answerDetailSection.classList.add('hidden');
        answersContainer.innerHTML = '<li>Loading answers...</li>';

        try {
            // Fetch answers from IndexedDB and store them
            currentSessionAnswers = await getAnswersForSession(sessionId);
            answersContainer.innerHTML = ''; // Clear loading message
            
            // Sort to ensure correct order
            currentSessionAnswers.sort((a,b) => a.questionIndex - b.questionIndex);

            currentSessionAnswers.forEach((answer, index) => {
                const li = document.createElement('li');
                li.textContent = `Question ${answer.questionIndex + 1}: ${answer.questionType}`;
                li.dataset.answerIndex = index; // Use index for easy lookup
                answersContainer.appendChild(li);
            });
        } catch (error) {
            console.error('Error fetching session answers:', error);
            answersContainer.innerHTML = '<li>Error loading answers.</li>';
        }
    });

    /**
     * Event handler for clicking on a specific answer to see details.
     */
    answersContainer.addEventListener('click', (event) => {
        if (event.target.tagName !== 'LI' || !event.target.dataset.answerIndex) return;

        const answerIndex = event.target.dataset.answerIndex;
        const selectedAnswer = currentSessionAnswers[answerIndex];

        if (selectedAnswer) {
            answerDetailSection.classList.remove('hidden');
            
            // --- Populate common fields ---
            detailQuestionType.textContent = selectedAnswer.questionType;
            detailQuestionPrompt.textContent = selectedAnswer.questionPrompt;
            detailTimestamp.textContent = new Date(selectedAnswer.timestamp).toLocaleString();
            
            // --- Create a URL for the recorded audio Blob ---
            const recordedAudioUrl = URL.createObjectURL(selectedAnswer.answerAudioBlob);
            detailAnswerAudio.src = recordedAudioUrl;
            detailAnswerAudio.load();

            // Set instruction audio path
            instructionAudio.src = `b1Test/instructionAudio/${selectedAnswer.questionType}.mp3`;
            instructionAudio.load();

            // --- Handle question-specific assets ---
            questionAssetContainer.innerHTML = '<label>Question Asset:</label>';
            storySection.classList.add('hidden');
            storyAssetContainer.innerHTML = '<label>Story Asset:</label>';

            if (selectedAnswer.questionType === 'describeImage') {
                const img = document.createElement('img');
                img.src = selectedAnswer.questionFile; // This is the path to the image
                img.alt = selectedAnswer.questionPrompt;
                questionAssetContainer.appendChild(img);
            } else {
                const qAudio = document.createElement('audio');
                qAudio.controls = true;
                qAudio.src = selectedAnswer.questionFile; // Path to question audio
                questionAssetContainer.appendChild(qAudio);
            }

            if (selectedAnswer.questionType === 'listenAndAnswer') {
                storySection.classList.remove('hidden');
                storyPrompt.textContent = selectedAnswer.storyPrompt;
                const sAudio = document.createElement('audio');
                sAudio.controls = true;
                sAudio.src = selectedAnswer.storyFile; // Path to story audio
                storyAssetContainer.appendChild(sAudio);
            }
        }
    });

    // --- Initial Load ---
    loadSessions();
});