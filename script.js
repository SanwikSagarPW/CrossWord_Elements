document.addEventListener('DOMContentLoaded', () => {
    const ENABLE_DEV_COMPLETE_SHORTCUT = false;
    const CROSSWORD_MAX_TOTAL_XP = 200;

    // ============================================
    // ANALYTICS SETUP
    // ============================================
    const analytics = AnalyticsManager.getInstance();
    let analyticsRunId = '';
    let levelStartTime = 0;
    let checkAttempts = 0;
    let elementLevels = [];
    const submittedElementLevels = new Set();
    
    // DOM Elements
    const gridElement = document.getElementById('crossword-grid');
    const acrossCluesElement = document.getElementById('across-clues');
    const downCluesElement = document.getElementById('down-clues');
    const titleElement = document.getElementById('puzzle-title');
    const levelElement = document.getElementById('puzzle-level');
    const checkButton = document.getElementById('check-btn');
    const submitButton = document.getElementById('submit-btn');
    const successOverlay = document.getElementById('success-overlay');
    const timesUpOverlay = document.getElementById('times-up-overlay');
    const incompleteOverlay = document.getElementById('incomplete-overlay');
    const restartButton = document.getElementById('restart-btn');
    const homeButton = document.getElementById('home-btn');
    const incompleteOkButton = document.getElementById('incomplete-ok-btn');
    const timerElement = document.getElementById('timer');
    const scoreDisplayElement = document.getElementById('score-display');
    const adminPanel = document.getElementById('admin-panel');
    const gameContainer = document.querySelector('.game-container');

    // State Management
    let currentPuzzleData = null;
    let gridState;
    let currentDirection = 'across';
    let activeClueInfo = null;
    let lastFocusedCell = { row: -1, col: -1 };
    let timerInterval = null;
    let timeRemaining = 0;
    const GAME_DURATION = 600; // 10 minutes in seconds

    function createRunId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        return `crossword_elements_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function postAnalyticsDebug(event, detail = {}) {
        try {
            window.parent.postMessage({
                __analyticsDebug: true,
                game: 'CrossWord_Elements',
                event,
                detail,
                at: new Date().toISOString()
            }, '*');
        } catch (_error) {
            // Debug-only for local harness visibility.
        }
    }

    function getElementLevelXp(levelNumber, totalLevels) {
        const baseXp = Math.floor(CROSSWORD_MAX_TOTAL_XP / totalLevels);
        const extraXpLevels = CROSSWORD_MAX_TOTAL_XP % totalLevels;
        return baseXp + (levelNumber <= extraXpLevels ? 1 : 0);
    }

    function buildElementLevels(clues) {
        const allClues = [...clues.across, ...clues.down];
        return allClues.map((clue, index) => ({
            clue,
            levelNumber: index + 1,
            xp: getElementLevelXp(index + 1, allClues.length)
        }));
    }

    function isClueSolved(clue) {
        const expectedAnswer = clue.answer.toUpperCase();
        for (let i = 0; i < expectedAnswer.length; i++) {
            const row = clue.direction === 'across' ? clue.row : clue.row + i;
            const col = clue.direction === 'across' ? clue.col + i : clue.col;
            const input = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"] input`);
            if (!input || input.value.toUpperCase() !== expectedAnswer[i]) {
                return false;
            }
        }

        return true;
    }

    function startAnalyticsLevels(metadata) {
        analyticsRunId = createRunId();
        submittedElementLevels.clear();
        checkAttempts = 0;
        analytics.initialize('CrossWord_Elements', analyticsRunId);
        elementLevels.forEach(({ clue, levelNumber, xp }) => {
            analytics.startLevel(levelNumber, { levelNumber });
            analytics.addRawMetric(`level_${levelNumber}_element`, clue.answer.toUpperCase());
            analytics.addRawMetric(`level_${levelNumber}_clue`, clue.clue);
            analytics.addRawMetric(`level_${levelNumber}_xp`, String(xp));
        });
        analytics.addRawMetric('puzzle_title', metadata.title);
        analytics.addRawMetric('puzzle_author', metadata.author || 'unknown');
        analytics.addRawMetric('element_count', String(elementLevels.length));
        analytics.addRawMetric('max_total_xp', String(CROSSWORD_MAX_TOTAL_XP));
        levelStartTime = Date.now();
        console.log('[Analytics] Element levels started:', { count: elementLevels.length, runId: analyticsRunId });
        postAnalyticsDebug('levels_started', { count: elementLevels.length, runId: analyticsRunId, title: metadata.title });
    }

    function submitElementLevel(levelInfo, metrics = {}) {
        const { clue, levelNumber, xp } = levelInfo;
        if (submittedElementLevels.has(levelNumber)) {
            postAnalyticsDebug('submit_skipped_duplicate', { level: levelNumber, runId: analyticsRunId });
            return null;
        }

        Object.entries(metrics).forEach(([key, value]) => {
            analytics.addRawMetric(key, String(value));
        });
        const timeTaken = Date.now() - levelStartTime;
        analytics.endLevel(levelNumber, true, timeTaken, xp);
        analytics.recordTask(
            levelNumber,
            `element_${levelNumber}`,
            clue.clue,
            clue.answer.toUpperCase(),
            clue.answer.toUpperCase(),
            timeTaken,
            xp
        );

        const payload = analytics.submitLevel(levelNumber, { runId: analyticsRunId });
        if (payload && payload.success === false) {
            console.error('[Analytics] Level submit rejected:', payload.errors);
            postAnalyticsDebug('submit_rejected', { level: levelNumber, runId: analyticsRunId, errors: payload.errors });
            return payload;
        }

        submittedElementLevels.add(levelNumber);
        try {
            window.parent.postMessage(payload, '*');
        } catch (_error) {
            // Bridge already attempted delivery; this supports the local harness.
        }
        console.log('[Analytics] Element level submitted:', { level: levelNumber, runId: analyticsRunId, xp, element: clue.answer });
        postAnalyticsDebug('submit_success', { level: levelNumber, runId: analyticsRunId, xpEarned: xp, element: clue.answer });
        return payload;
    }

    function submitCompletedElements(metrics = {}) {
        let submittedCount = 0;
        elementLevels.forEach(levelInfo => {
            if (!submittedElementLevels.has(levelInfo.levelNumber) && isClueSolved(levelInfo.clue)) {
                submitElementLevel(levelInfo, metrics);
                submittedCount++;
            }
        });

        return submittedCount;
    }

    function getSubmittedXpTotal() {
        return elementLevels.reduce((total, levelInfo) => {
            return total + (submittedElementLevels.has(levelInfo.levelNumber) ? levelInfo.xp : 0);
        }, 0);
    }

    // --- GAME FLOW & INITIALIZATION ---

    async function startGame() {
        try {
            const response = await fetch('puzzle.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            currentPuzzleData = await response.json();
            elementLevels = buildElementLevels(currentPuzzleData.clues);
            initializeGame();
            startAnalyticsLevels(currentPuzzleData.metadata);
        } catch(error) {
            console.error("Failed to start game:", error);
            gridElement.innerHTML = `<p style="color: var(--error-color);">Could not load puzzle. Please check puzzle.json and refresh.</p>`;
        }
    }

    function initializeGame() {
        lastFocusedCell = { row: -1, col: -1 };
        currentDirection = 'across';
        timeRemaining = GAME_DURATION;
        checkAttempts = 0;
        
        try {
            const { metadata, clues } = currentPuzzleData;
            const { rows, cols } = metadata.size;
            titleElement.textContent = metadata.title;
            levelElement.textContent = 'Level 1';
            gridState = Array(rows).fill(null).map(() => Array(cols).fill(null));
            gridElement.style.setProperty('--grid-rows', rows);
            gridElement.style.setProperty('--grid-cols', cols);
            populateGridState(clues.across);
            populateGridState(clues.down);
            renderGrid(rows, cols);
            renderClues(clues.across, acrossCluesElement, 'across');
            renderClues(clues.down, downCluesElement, 'down');
            startTimer();
        } catch (error) {
            console.error("CRITICAL ERROR building puzzle:", error);
            gridElement.innerHTML = `<p style="color: var(--error-color);">A critical error occurred while building the puzzle.</p>`;
        }
    }
    
    // --- TIMER LOGIC ---

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);

        const updateDisplay = () => {
            const minutes = Math.floor(timeRemaining / 60);
            const seconds = timeRemaining % 60;
            timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };

        updateDisplay();
        timerInterval = setInterval(() => {
            if (timeRemaining > 0) {
                timeRemaining--;
                updateDisplay();
            } else {
                endGameByTimeUp();
            }
        }, 1000);
    }

    function endGameByTimeUp() {
        clearInterval(timerInterval);
        timerElement.textContent = "0:00";
        timesUpOverlay.classList.remove('hidden');
        document.querySelectorAll('.cell-input').forEach(input => { input.readOnly = true; });
        checkButton.disabled = true;
        submitButton.disabled = true;
    }

    // --- GRID & CLUE RENDERING ---

    function populateGridState(clueList) {
        clueList.forEach(clue => {
            const answer = clue.answer.toUpperCase();
            for (let i = 0; i < answer.length; i++) {
                const r = clue.direction === 'across' ? clue.row : clue.row + i;
                const c = clue.direction === 'across' ? clue.col + i : clue.col;
                if (!gridState[r][c]) gridState[r][c] = { answer: '', words: [] };
                gridState[r][c].answer = answer[i];
                if (!gridState[r][c].words.some(w => w.number === clue.number && w.direction === clue.direction)) {
                    gridState[r][c].words.push({ number: clue.number, direction: clue.direction });
                }
                if (i === 0) gridState[r][c].clueNumber = clue.number;
            }
        });
    }

    function renderGrid(rows, cols) {
        gridElement.innerHTML = '';
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cellData = gridState[r][c];
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                
                const devCoords = document.createElement('div');
                devCoords.className = 'dev-coords';
                devCoords.textContent = `${r},${c}`;
                cell.appendChild(devCoords);

                if (!cellData) {
                    cell.classList.add('empty');
                } else {
                    const devAnswer = document.createElement('div');
                    devAnswer.className = 'dev-answer';
                    devAnswer.textContent = cellData.answer;
                    cell.appendChild(devAnswer);

                    if (cellData.clueNumber) {
                        const numDiv = document.createElement('div');
                        numDiv.className = 'clue-number';
                        numDiv.textContent = cellData.clueNumber;
                        cell.appendChild(numDiv);
                    }
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.maxLength = 1;
                    input.className = 'cell-input';
                    input.dataset.answer = cellData.answer.toUpperCase();
                    input.addEventListener('input', handleCellInput);
                    input.addEventListener('focus', () => handleFocus(r, c));
                    input.addEventListener('keydown', handleKeyDown);
                    cell.appendChild(input);
                }
                gridElement.appendChild(cell);
            }
        }
    }

    function renderClues(clueList, listElement, direction) {
        listElement.innerHTML = '';
        clueList.forEach(clue => {
            const li = document.createElement('li');
            li.textContent = `${clue.number}. ${clue.clue}`;
            li.dataset.number = clue.number;
            li.dataset.direction = direction;
            li.addEventListener('click', handleClueClick);
            listElement.appendChild(li);
        });
    }

    // --- USER INPUT & INTERACTION ---

    function handleCellInput(e) {
        e.target.value = e.target.value.toUpperCase();
        if (e.target.value.length === 0 || !activeClueInfo) return;

        const { row: startRow, col: startCol, answer } = activeClueInfo;
        const currentCellPos = e.target.parentElement.dataset;
        let currentWordIndex = (currentDirection === 'across')
            ? parseInt(currentCellPos.col) - startCol
            : parseInt(currentCellPos.row) - startRow;
        
        if (currentWordIndex < answer.length - 1) {
            const nextIndex = currentWordIndex + 1;
            const r = (currentDirection === 'across') ? startRow : startRow + nextIndex;
            const c = (currentDirection === 'across') ? startCol + nextIndex : startCol;
            const nextCell = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"] input`);
            if (nextCell && !nextCell.readOnly) nextCell.focus();
        }
    }

    function handleKeyDown(e) {
        const cell = e.target.parentElement;
        let { row, col } = cell.dataset;
        row = parseInt(row); col = parseInt(col);

        if (e.key === 'Backspace' && e.target.value === '') {
            e.preventDefault();
            const prevR = (currentDirection === 'down') ? row - 1 : row;
            const prevC = (currentDirection === 'across') ? col - 1 : col;
            const prevCell = document.querySelector(`.grid-cell[data-row="${prevR}"][data-col="${prevC}"] input`);
            if (prevCell) prevCell.focus();
            return;
        }

        let nextR = row, nextC = col;
        switch (e.key) {
            case 'ArrowUp': nextR--; break;
            case 'ArrowDown': nextR++; break;
            case 'ArrowLeft': nextC--; break;
            case 'ArrowRight': nextC++; break;
            default: return;
        }
        const nextCell = document.querySelector(`.grid-cell[data-row="${nextR}"][data-col="${nextC}"] input`);
        if (nextCell) {
            e.preventDefault();
            nextCell.focus();
        }
    }
    
    function handleFocus(row, col) {
        const cellData = gridState[row][col];
        if (!cellData) return;
        const hasAcross = cellData.words.some(w => w.direction === 'across');
        const hasDown = cellData.words.some(w => w.direction === 'down');
        
        if (lastFocusedCell.row === row && lastFocusedCell.col === col) {
            if (hasAcross && hasDown) currentDirection = currentDirection === 'across' ? 'down' : 'across';
        } else {
            const isCurrentDirectionValid = (currentDirection === 'across' && hasAcross) || (currentDirection === 'down' && hasDown);
            if (!isCurrentDirectionValid) currentDirection = hasAcross ? 'across' : 'down';
        }
        lastFocusedCell = { row, col };
        highlightWord(row, col, currentDirection);
    }

    function handleClueClick(e) {
        const { number, direction } = e.target.dataset;
        const clue = currentPuzzleData.clues[direction].find(c => c.number == number);
        if (clue) {
            currentDirection = direction;
            const firstCellInput = document.querySelector(`.grid-cell[data-row="${clue.row}"][data-col="${clue.col}"] input`);
            if (firstCellInput) firstCellInput.focus();
        }
    }

    function highlightWord(row, col, direction) {
        document.querySelectorAll('.focused-word, li.highlighted').forEach(el => el.classList.remove('highlighted', 'focused-word'));
        const cellData = gridState[row][col];
        if (!cellData) return;
        const wordInfo = cellData.words.find(w => w.direction === direction);
        if (!wordInfo) return;
        activeClueInfo = currentPuzzleData.clues[direction].find(c => c.number === wordInfo.number);
        if (!activeClueInfo) return;
        document.querySelector(`li[data-number="${activeClueInfo.number}"][data-direction="${direction}"]`)?.classList.add('highlighted');
        for (let i = 0; i < activeClueInfo.answer.length; i++) {
            const r = direction === 'across' ? activeClueInfo.row : activeClueInfo.row + i;
            const c = direction === 'across' ? activeClueInfo.col + i : activeClueInfo.col;
            document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`)?.classList.add('focused-word');
        }
    }

    // --- PUZZLE CHECKING & SUBMISSION ---

    function checkCompletion() {
        checkAttempts++;
        const inputs = [...document.querySelectorAll('.cell-input')];
        const allFilled = inputs.every(input => input.value.trim() !== '');
        const filledCount = inputs.filter(input => input.value.trim() !== '').length;
        const totalCells = inputs.length;
        const completionPercent = ((filledCount / totalCells) * 100).toFixed(1);
        
        // Log check attempt
        console.log('[Analytics] Check attempt #' + checkAttempts, {
            filled: filledCount,
            total: totalCells,
            completion: completionPercent + '%'
        });

        if (allFilled) {
            checkButton.classList.add('hidden');
            submitButton.classList.remove('hidden');
        } else {
            incompleteOverlay.classList.remove('hidden');
        }
    }

    function submitPuzzle() {
        const inputs = document.querySelectorAll('.cell-input');
        let allCorrect = true;
        let correctCount = 0;
        let incorrectCount = 0;
        
        inputs.forEach(input => {
            const enteredValue = input.value.toUpperCase();
            const correctValue = input.dataset.answer;
            if (enteredValue === correctValue) {
                input.classList.add('correct');
                correctCount++;
            } else {
                allCorrect = false;
                incorrectCount++;
                input.classList.add('incorrect-flash');
            }
        });
        
        const accuracy = inputs.length > 0 ? ((correctCount / inputs.length) * 100).toFixed(1) : 0;

        if (allCorrect) {
            clearInterval(timerInterval);
            const newlySubmittedElements = submitCompletedElements({
                check_attempts: checkAttempts,
                accuracy_percent: accuracy,
                correct_count: correctCount,
                incorrect_count: incorrectCount,
                total_cells: inputs.length,
                time_taken_seconds: GAME_DURATION - timeRemaining
            });
            const finalScore = getSubmittedXpTotal();
            console.log('[Analytics] Newly completed elements submitted:', newlySubmittedElements);
            console.log(`[Analytics] Puzzle completed with score: ${finalScore} / ${CROSSWORD_MAX_TOTAL_XP}`);
            scoreDisplayElement.textContent = finalScore;
            inputs.forEach(input => input.readOnly = true);
            successOverlay.classList.remove('hidden');
        } else {
            console.log('[Analytics] Submit attempt failed:', {
                correct: correctCount,
                incorrect: incorrectCount,
                accuracy: accuracy + '%'
            });
            
            submitCompletedElements({
                check_attempts: checkAttempts,
                accuracy_percent: accuracy,
                correct_count: correctCount,
                incorrect_count: incorrectCount,
                total_cells: inputs.length,
                failed_submit: true
            });
            
            setTimeout(() => {
                inputs.forEach(input => {
                    input.classList.remove('incorrect-flash');
                    if (input.classList.contains('correct')) {
                        input.readOnly = true;
                    }
                });
            }, 2000); // Remove flash after 2 seconds
        }
    }

    // --- SECRET CODES & EVENT LISTENERS ---

    let keySequence = "";
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.key.length > 1) return;
        keySequence += (e.key === '`' || e.key === '~') ? '~' : e.key.toLowerCase();
        
        const codes = {
            "~asd": () => adminPanel.classList.toggle('hidden'),
            "~adev": () => gameContainer.classList.add('dev-mode', 'dev-answers-mode'),
            "~dev": () => {
                gameContainer.classList.toggle('dev-mode');
                gameContainer.classList.remove('dev-answers-mode');
            },
            "~sdev": () => gameContainer.classList.remove('dev-mode', 'dev-answers-mode')
        };

        for (const code in codes) {
            if (keySequence.endsWith(code)) {
                codes[code]();
                keySequence = "";
                return;
            }
        }
        if (keySequence.length > 5) keySequence = keySequence.slice(-5);
    });

    checkButton.addEventListener('click', checkCompletion);
    submitButton.addEventListener('click', submitPuzzle);
    restartButton.addEventListener('click', () => location.reload());
    homeButton.addEventListener('click', () => { window.location.href = 'index.html'; });
    incompleteOkButton.addEventListener('click', () => incompleteOverlay.classList.add('hidden'));

    function completeCurrentPuzzleForTest() {
        if (!ENABLE_DEV_COMPLETE_SHORTCUT) {
            console.log('DEV: Auto-complete ignored because debug shortcut is disabled.');
            return;
        }

        const inputs = document.querySelectorAll('.cell-input');
        if (!inputs.length) {
            console.log('DEV: Auto-complete ignored because puzzle inputs are not ready.');
            return;
        }

        inputs.forEach(input => {
            input.value = input.dataset.answer || '';
            input.readOnly = false;
            input.classList.remove('incorrect-flash');
        });
        checkCompletion();
        console.log('DEV: Auto-completing crossword elements puzzle...');
        submitPuzzle();
    }

    window.__completeLevelForTest = completeCurrentPuzzleForTest;

    function handleDevCompleteKey(event) {
        if ((event.key && event.key.toLowerCase() === 'c') || event.code === 'KeyC') {
            if (event.__crosswordElementsDevCompleteHandled) {
                return;
            }
            event.__crosswordElementsDevCompleteHandled = true;
            event.preventDefault();
            completeCurrentPuzzleForTest();
        }
    }

    window.addEventListener('keydown', handleDevCompleteKey, true);
    document.addEventListener('keydown', handleDevCompleteKey, true);

    window.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'DEV_COMPLETE_LEVEL') {
            completeCurrentPuzzleForTest();
        }
    });
    
    // Start Game
    startGame();
});
