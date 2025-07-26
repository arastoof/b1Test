import { addAnswer } from './db.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- UI Elements (same as before) ---
    const startScreen = document.getElementById('start-screen');
    const testScreen = document.getElementById('test-screen');
    const startBtn = document.getElementById('start-btn');
    const taskTitle = document.getElementById('task-title');
    const questionArea = document.getElementById('question-area');
    const nextBtn = document.getElementById('next-btn');
    const finishBtn = document.getElementById('finish-btn');
    const playbackStatusBox = document.getElementById('playback-status-box');
    const recordingStatusBox = document.getElementById('recording-status-box');
    const playbackStatus = document.getElementById('playback-status');
    const volumeSlider = document.getElementById('volume');
    const playbackProgress = document.getElementById('playback-progress');
    const recordingStatus = document.getElementById('recording-status');
    const recordingProgress = document.getElementById('recording-progress');

    // --- Global State ---
    let mediaRecorder;
    let audioChunks = [];
    let currentQuestionIndex = 0;
    let listenAndAnswerSubIndex = 0;
    let testPlaylist = [];
    let allQuestions = {};
    let sessionId = null;
    let timerInterval;
    let activeAudio = null;

    // --- Constants ---
    const baseStaticFolder = '/b1Test';
    const baseJsonFolder = 'assetsJson';
    const questionAudioFolder = `${baseStaticFolder}/questionAudio`;
    const instructionAudioFolder = `${baseStaticFolder}/instructionAudio`;
    const imagesFolder = `${baseStaticFolder}/images`;
    const QUESTIONS_PER_TYPE = 3;
    const repeatSentenceTime = 20;
    const describeImageTime = 25;
    const retellStoryTime = 30;
    const answerQuestionTime = 20;

    // --- Utility Functions ---
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    /**
     * Generates the test playlist from the new questions.json structure.
     */
    function generateTestPlaylist() {
        let generatedQuestions = [];

        // 1. Repeat Sentence
        const repeatSentencePool = [...allQuestions.repeatSentence];
        shuffleArray(repeatSentencePool);
        generatedQuestions.push(...repeatSentencePool.slice(0, QUESTIONS_PER_TYPE).map(q => ({
            type: 'repeatSentence',
            title: 'Repeat the Sentence',
            instruction: `1. Listen to the sentence.<br>2. After the beep, repeat the sentence. [${repeatSentenceTime} seconds]`,
            instructionAudio: `${instructionAudioFolder}/repeatSentence.mp3`,
            promptText: q.prompt,
            promptAudio: `${questionAudioFolder}/repeatSentence/${q.file}`
        })));

        // 2. Describe Image
        const describeImagePool = [...allQuestions.describeImage];
        shuffleArray(describeImagePool);
        generatedQuestions.push(...describeImagePool.slice(0, QUESTIONS_PER_TYPE).map(q => ({
            type: 'describeImage',
            title: 'Describe the Image',
            instruction: `1. Look at the picture. [${describeImageTime} seconds]<br>2. After the beep, describe the picture. [${describeImageTime} seconds]`,
            instructionAudio: `${instructionAudioFolder}/describeImage.mp3`,
            promptText: q.prompt,
            image: `${imagesFolder}/${q.file}`,
            prepTime: describeImageTime,
            speakTime: describeImageTime
        })));

        // 3. Retell Story
        const retellStoryPool = [...allQuestions.retellStory];
        shuffleArray(retellStoryPool);
        generatedQuestions.push(...retellStoryPool.slice(0, QUESTIONS_PER_TYPE).map(q => ({
            type: 'retellStory',
            title: 'Retell the Story',
            instruction: `1. Listen to the story.<br>2. After the beep, retell it in your own words. [${retellStoryTime} seconds]`,
            instructionAudio: `${instructionAudioFolder}/retellStory.mp3`,
            promptText: q.prompt,
            storyAudio: `${questionAudioFolder}/retellStory/${q.file}`
        })));

        // 4. Listen and Answer
        const listenAndAnswerPool = [...allQuestions.listenAndAnswer];
        shuffleArray(listenAndAnswerPool);
        generatedQuestions.push(...listenAndAnswerPool.slice(0, QUESTIONS_PER_TYPE).map(item => ({ 
            type: 'listenAndAnswer',
            title: 'Listen and Answer',
            instruction: `1. Listen to the story.<br>2. Answer each question about the story. [${answerQuestionTime} seconds]`,
            instructionAudio: `${instructionAudioFolder}/listenAndAnswer.mp3`,
            storyPrompt: item.story.prompt,
            storyAudio: `${questionAudioFolder}/listenAndAnswer/${item.baseFolder}/${item.story.file}`,
            questions: item.questions.map(q => ({
                promptText: q.prompt,
                audio: `${questionAudioFolder}/listenAndAnswer/${item.baseFolder}/${q.file}`
            }))
        })));
        
        testPlaylist = generatedQuestions;
    }

    // --- Core Test Logic ---
    function displayQuestion() {
        clearInterval(timerInterval);
        const question = testPlaylist[currentQuestionIndex];
        listenAndAnswerSubIndex = 0;

        // Reset UI
        questionArea.innerHTML = '';
        questionArea.classList.remove('describe-image-layout');
        nextBtn.classList.add('hidden');
        finishBtn.classList.add('hidden');
        taskTitle.textContent = question.title;
        recordingStatus.textContent = 'Waiting';
        recordingProgress.value = 0;

        const onInstructionEnd = () => {
            switch (question.type) {
                case 'repeatSentence':
                    questionArea.innerHTML = `<p><strong>Instructions:</strong><br>${question.instruction}</p>`;
                    playAudio(question.promptAudio, () => setupRecording(repeatSentenceTime));
                    break;
                case 'describeImage':
                    questionArea.classList.add('describe-image-layout');
                    questionArea.innerHTML = `
                        <div class="image-wrapper">
                            <img src="${question.image}" alt="Test Image">
                        </div>
                        <div class="instructions-wrapper">
                            <p><strong>Instructions:</strong><br>${question.instruction}</p>
                        </div>
                    `;
                    startTimer(question.prepTime, 'Preparation', () => {
                        setupRecording(question.speakTime);
                    });
                    break;
                case 'retellStory':
                    questionArea.innerHTML = `<p><strong>Instructions:</strong><br>${question.instruction}</p>`;
                    playAudio(question.storyAudio, () => setupRecording(retellStoryTime));
                    break;
                case 'listenAndAnswer':
                    questionArea.innerHTML = `<p><strong>Instructions:</strong><br>${question.instruction}</p>`;
                    playAudio(question.storyAudio, () => askListenAnswerQuestion(), true);
                    break;
            }
        };
        playAudio(question.instructionAudio, onInstructionEnd, true, true);
    }

    function askListenAnswerQuestion() {
        const questionSet = testPlaylist[currentQuestionIndex];
        if (listenAndAnswerSubIndex < questionSet.questions.length) {
            const subQuestion = questionSet.questions[listenAndAnswerSubIndex];
            
            // Display the sub-question prompt 
            // const subPromptDiv = document.createElement('div');
            // subPromptDiv.className = 'prompt-text-display sub-question';
            // subPromptDiv.innerHTML = `<strong>Question ${listenAndAnswerSubIndex + 1}:</strong> ${subQuestion.promptText}`;
            // questionArea.appendChild(subPromptDiv);

            playAudio(subQuestion.audio, () => {
                setupRecording(answerQuestionTime, () => {
                    listenAndAnswerSubIndex++;
                    askListenAnswerQuestion();
                });
            });
        } else {
            recordingStatus.textContent = "Section complete.";
            nextBtn.classList.remove('hidden');
        }
    }

    // --- REPLACES your old sendAudioToServer function ---
    async function saveAnswerLocally(blob, filename) {
        const q = testPlaylist[currentQuestionIndex];
        recordingStatus.textContent = "Saving locally...";

        // Create a comprehensive object to save
        const answerData = {
            sessionId: sessionId,
            questionIndex: currentQuestionIndex,
            questionType: q.type,
            questionPrompt: q.promptText,
            answerAudioBlob: blob, // Store the actual Blob
            answerFilename: filename,
            timestamp: new Date().toISOString()
        };
        
        // Add question-specific details
        if (q.type === 'listenAndAnswer') {
            const subQ = q.questions[listenAndAnswerSubIndex];
            answerData.storyPrompt = q.storyPrompt;
            answerData.storyFile = q.storyAudio;
            answerData.questionPrompt = subQ.promptText;
            answerData.questionFile = subQ.audio;
        } else {
            answerData.questionFile = q.promptAudio || q.image || q.storyAudio;
        }

        try {
            await addAnswer(answerData);
            console.log('Answer saved successfully to IndexedDB');
            recordingStatus.textContent = "Saved.";
        } catch (err) {
            console.error('Failed to save answer:', err);
            recordingStatus.textContent = "Save failed.";
        }
    }
    
    async function initializeTest() {
        try {
            const response = await fetch(`${baseJsonFolder}/questions.json?v=${Date.now()}`); // bust cache
            if (!response.ok) throw new Error('Network response was not ok.');
            allQuestions = await response.json();
            startBtn.disabled = false;
            startBtn.textContent = 'Start Test';
        } catch (error) {
            console.error('Failed to load question data:', error);
            startBtn.textContent = 'Failed to load test';
        }
    }
    startBtn.addEventListener('click', () => {
        if (testPlaylist.length === 0) generateTestPlaylist();
        startScreen.classList.add('hidden');
        testScreen.classList.remove('hidden');
        sessionId = 'session_' + Date.now();
        displayQuestion();
    });
    nextBtn.addEventListener('click', () => {
        currentQuestionIndex++;
        if (currentQuestionIndex < testPlaylist.length) {
            displayQuestion();
        } else {
            testScreen.innerHTML = `
                <h2>Test Complete!</h2>
                <p>What would you like to do next?</p>
                <div class="footer-controls">
                    <button id="retry-btn">Retry Test</button>
                    <button id="review-btn">Review Answers</button>
                </div>
            `;
            document.getElementById('retry-btn').addEventListener('click', () => {
                window.location.reload(); // Reloads the page to start over
            });
            document.getElementById('review-btn').addEventListener('click', () => {
                window.location.href = 'reviewer'; // Navigate to the reviewer page
            });
        }
    });
    finishBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            stopRecording();
        }
    });
    function playAudio(audioSrc, onEndedCallback, noBeepAfter = false, isInstruction = false) {
        // 1. Stop any audio that is currently playing to prevent conflicts
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.src = ''; // Detach the source to stop loading
            activeAudio.onended = null;
            activeAudio.ontimeupdate = null;
        }

        // 2. Configure UI elements
        if (!isInstruction) {
            playbackStatusBox.classList.remove('hidden');
            playbackStatus.textContent = "Playing...";
            playbackProgress.value = 0; // Reset progress bar
        } else {
            playbackStatusBox.classList.add('hidden');
        }

        // 3. Create and track the new audio object
        activeAudio = new Audio(audioSrc);
        activeAudio.volume = volumeSlider.value;
        volumeSlider.oninput = () => {
            if (activeAudio) activeAudio.volume = activeAudio.volume;
        };

        // 4. Update progress bar safely
        activeAudio.ontimeupdate = () => {
            if (!isInstruction && activeAudio && activeAudio.duration) {
                if (isFinite(activeAudio.duration)) {
                    playbackProgress.value = (activeAudio.currentTime / activeAudio.duration) * 100;
                }
            }
        };

        // 5. Define what happens when audio finishes
        activeAudio.onended = () => {
            if (!isInstruction) playbackStatus.textContent = "Finished";

            // If no beep is needed, just run the callback
            if (noBeepAfter) {
                activeAudio = null; // Clear the active audio
                if (onEndedCallback) onEndedCallback();
                return;
            }

            // Otherwise, play the beep using the same audio element
            activeAudio.src = `${instructionAudioFolder}/beep.mp3`;
            activeAudio.onended = () => { // When the beep finishes...
                activeAudio = null;      // ...clear the active audio
                if (onEndedCallback) onEndedCallback(); // ...and run the callback
            };
            activeAudio.play().catch(e => {
                console.error("Beep playback failed:", e);
                if (onEndedCallback) onEndedCallback(); // Still run callback on failure
            });
        };

        // 6. Play the main audio file
        activeAudio.play().catch(e => {
            if (e.name !== 'AbortError') {
            console.error(`Audio play failed for ${audioSrc}:`, e);
            }
        });
    }
    function startTimer(duration, statusText, onTimerEndCallback) {
        let timeLeft = duration;
        const updateTimer = () => {
            recordingStatus.textContent = `${statusText}: ${timeLeft}s remaining`;
            recordingProgress.value = ((duration - timeLeft) / duration) * 100;
            if (timeLeft <= 0) {
                if (mediaRecorder && mediaRecorder.state === "recording") {
                    stopRecording();
                } else {
                    clearInterval(timerInterval);
                    const beep = new Audio(`${instructionAudioFolder}/beep.mp3`);
                    beep.play();
                    beep.onended = onTimerEndCallback;
                }
            }
            timeLeft--;
        };
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
    }
    function setupRecording(duration, onRecordingStoppedCallback = null) {
        finishBtn.classList.remove('hidden');
        startRecording(onRecordingStoppedCallback);
        startTimer(duration, 'Recording', () => {});
    }
    async function startRecording(onRecordingStoppedCallback) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.addEventListener("dataavailable", event => audioChunks.push(event.data));
            
            mediaRecorder.onstop = () => {
                finishBtn.classList.add('hidden');
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                let filename;
                const q = testPlaylist[currentQuestionIndex];
                if (q.type === 'listenAndAnswer') {
                    filename = `q${currentQuestionIndex + 1}_sub${listenAndAnswerSubIndex + 1}.wav`;
                } else {
                    filename = `q${currentQuestionIndex + 1}.wav`;
                }

                saveAnswerLocally(audioBlob, filename);

                stream.getTracks().forEach(track => track.stop());
                if (q.type !== 'listenAndAnswer') {
                    nextBtn.classList.remove('hidden');
                }
                if (onRecordingStoppedCallback) onRecordingStoppedCallback();
            };
            mediaRecorder.start();
        } catch (err) {
            console.error("Error accessing microphone:", err);
            recordingStatus.textContent = "Microphone access denied.";
        }
    }
    function stopRecording() {
        clearInterval(timerInterval);
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
    }

    // --- Run Initialization ---
    startBtn.disabled = true;
    startBtn.textContent = 'Loading Test...';
    initializeTest();
});
