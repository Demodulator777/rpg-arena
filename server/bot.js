// ==UserScript==
// @name         DragonMission
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto travel to Dragon's location and perform large mission with selectable karma (Light/Good or Dark/Evil).
// @author       You
// @match        https://s*.battleknight.gameforge.com/world/location*
// @match        https://s*.battleknight.gameforge.com/world/travel
// @match        https://s*.battleknight.gameforge.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    GM_addStyle(`
        .bk-auto-travel-status {
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 9999;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 14px;
            border-left: 5px solid #4CAF50;
            max-width: 350px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            backdrop-filter: blur(5px);
        }
        .bk-auto-travel-status.error {
            border-left-color: #f44336;
            background: rgba(0, 0, 0, 0.95);
        }
        .bk-auto-travel-status.warning {
            border-left-color: #ff9800;
        }
        .bk-auto-travel-status.info {
            border-left-color: #2196F3;
        }
        .bk-auto-travel-status.success {
            border-left-color: #4CAF50;
        }
        .bk-status-header {
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .bk-status-header::before {
            content: "🐉";
        }
        .bk-status-section {
            margin: 8px 0;
            padding: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }
        .bk-status-label {
            font-weight: bold;
            color: #90CAF9;
            margin-right: 5px;
        }
        .bk-status-value {
            color: #fff;
        }
        .bk-status-value.current {
            color: #4CAF50;
            font-weight: bold;
        }
        .bk-status-value.target {
            color: #FF9800;
            font-weight: bold;
        }
        .bk-status-value.next {
            color: #2196F3;
            font-weight: bold;
        }
        .bk-status-value.dragon {
            color: #E91E63;
            font-weight: bold;
        }
        .bk-path-display {
            margin-top: 10px;
            padding: 10px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 4px;
            border: 1px dashed rgba(255, 255, 255, 0.2);
        }
        .bk-path-step {
            display: inline-block;
            margin: 0 5px;
            padding: 3px 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }
        .bk-path-step.current {
            background: rgba(76, 175, 80, 0.3);
            border: 1px solid #4CAF50;
        }
        .bk-path-step.next {
            background: rgba(33, 150, 243, 0.3);
            border: 1px solid #2196F3;
        }
        .bk-path-step.future {
            opacity: 0.6;
        }
        .bk-path-arrow {
            color: #888;
            margin: 0 5px;
        }
        .bk-start-button {
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            margin-top: 10px;
            display: block;
            width: 100%;
            text-align: center;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .bk-start-button:hover {
            background: linear-gradient(135deg, #45a049, #4CAF50);
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        .bk-progress-bar {
            height: 6px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
            margin-top: 10px;
            overflow: hidden;
        }
        .bk-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #2196F3);
            width: 0%;
            transition: width 0.5s ease;
            border-radius: 3px;
        }
        .bk-timer {
            font-size: 12px;
            color: #aaa;
            margin-top: 5px;
            text-align: right;
        }
        .bk-traveling-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: white;
            font-family: 'Segoe UI', Arial, sans-serif;
        }
        .bk-traveling-message {
            background: rgba(0, 0, 0, 0.9);
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            max-width: 400px;
            border: 2px solid #4CAF50;
        }
        .bk-traveling-spinner {
            width: 50px;
            height: 50px;
            border: 5px solid rgba(76, 175, 80, 0.3);
            border-top: 5px solid #4CAF50;
            border-radius: 50%;
            animation: bk-spin 1s linear infinite;
            margin-bottom: 20px;
        }
        @keyframes bk-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .bk-karma-toggle {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 8px 0;
            padding: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }
        .bk-karma-label {
            font-weight: bold;
            color: #90CAF9;
        }
        .bk-karma-btn {
            padding: 5px 15px;
            border: 2px solid;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s ease;
            background: transparent;
            font-size: 13px;
        }
        .bk-karma-btn.light {
            border-color: #FFD700;
            color: #FFD700;
        }
        .bk-karma-btn.light.active {
            background: #FFD700;
            color: #000;
        }
        .bk-karma-btn.dark {
            border-color: #9C27B0;
            color: #9C27B0;
        }
        .bk-karma-btn.dark.active {
            background: #9C27B0;
            color: #fff;
        }
        .bk-ruby-toggle {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 8px 0;
            padding: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }
        .bk-ruby-label {
            font-weight: bold;
            color: #90CAF9;
        }
        .bk-ruby-btn {
            padding: 5px 15px;
            border: 2px solid;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s ease;
            background: transparent;
            font-size: 13px;
        }
        .bk-ruby-btn.off {
            border-color: #f44336;
            color: #f44336;
        }
        .bk-ruby-btn.off.active {
            background: #f44336;
            color: #fff;
        }
        .bk-ruby-btn.on {
            border-color: #4CAF50;
            color: #4CAF50;
        }
        .bk-ruby-btn.on.active {
            background: #4CAF50;
            color: #fff;
        }
        .bk-stop-button {
            background: linear-gradient(135deg, #f44336, #d32f2f);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            margin-top: 10px;
            display: block;
            width: 100%;
            text-align: center;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .bk-stop-button:hover {
            background: linear-gradient(135deg, #d32f2f, #b71c1c);
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
    `);

    // Detect server from current URL (e.g. s27-pt, s34-us)
    const SERVER = window.location.hostname;

    const URLS = {
        LOCATION: `https://${SERVER}/world/location`,
        TRAVEL: `https://${SERVER}/world/travel`
    };

    const SELECTORS = {
        CITY_ELEMENT: '#contentTitle h1',
        DRAGON_ICON: '#DragonIcon',
        TRAVEL_BUTTON: 'a.button[onclick*="startTravel"]',
        SPECIAL_TRAVEL_BUTTON_ALVAN: 'a.button.boxed.tooltip[onclick*="startTravel(\'HarbourTwo\'"]',
        SPECIAL_TRAVEL_BUTTON_WAILE: 'a.button.boxed.tooltip[onclick*="startTravel(\'HarbourOne\'"]',
        TRAVEL_TIMER: '#progressbarEnds span',
        DRAGON_EVENT: '#DragonEventGreatDragon',
        DRAGON_MISSION_BUTTON: 'a.devLarge.specialButton'
    };

    // Mappings for the city names (displayed name -> button name)
    const cityMappings = new Map([
        ["Sedwich", "HarbourThree"],
        ["Grand", "TradingPostOne"],
        ["Tarant", "VillageOne"],
        ["Endalain", "CapitalCity"],
        ["Asgal", "CoastalFortressOne"],
        ["Talfour", "GhostTown"],
        ["Alcran", "CityOne"],
        ["Gastain", "CoastalFortressTwo"],
        ["Hatwig", "VillageTwo"],
        ["Talmet", "TradingPostTwo"],
        ["Waile", "HarbourOne"],
        ["Ramstill", "VillageThree"],
        ["Brant", "TradingPostThree"],
        ["Thulgar", "FortressOne"],
        ["Alvan", "HarbourTwo"],
        ["Milley", "TradingPostFour"],
        ["Jarow", "VillageFour"],
        ["Segur", "FortressTwo"]
    ]);

    // Create a reverse lookup map (button name -> displayed name)
    const reverseCityMappings = new Map();
    for (const [displayName, buttonName] of cityMappings) {
        reverseCityMappings.set(buttonName, displayName);
    }

    // Define the travel paths (using displayed names)
    const travelPaths = new Map([
        ["Gastain", ["Alcran"]],
        ["Alcran", ["Gastain", "Talfour"]],
        ["Talfour", ["Alcran", "Grand"]],
        ["Grand", ["Talfour", "Tarant", "Sedwich", "Endalain"]],
        ["Tarant", ["Grand"]],
        ["Sedwich", ["Grand"]],
        ["Endalain", ["Grand", "Asgal", "Talmet"]],
        ["Asgal", ["Endalain"]],
        ["Talmet", ["Endalain", "Hatwig", "Waile"]],
        ["Hatwig", ["Talmet"]],
        ["Waile", ["Talmet", "Brant", "Alvan"]],
        ["Brant", ["Waile", "Ramstill", "Thulgar"]],
        ["Ramstill", ["Brant"]],
        ["Thulgar", ["Brant"]],
        ["Alvan", ["Waile", "Milley"]],
        ["Milley", ["Alvan", "Jarow", "Segur"]],
        ["Jarow", ["Milley"]],
        ["Segur", ["Milley"]]
    ]);

    // State management
    let isTraveling = false;
    let travelInitiated = false;
    let currentDragonLocation = null;
    let travelDestination = null;

    // Get stored karma preference (default: 'Good')
    function getKarma() {
        return localStorage.getItem('dragonKarma') || 'Good';
    }

    function setKarma(value) {
        localStorage.setItem('dragonKarma', value);
    }

    function getUseRubies() {
        return localStorage.getItem('useRubiesFallback') === 'true';
    }

    function setUseRubies(value) {
        localStorage.setItem('useRubiesFallback', value ? 'true' : 'false');
    }

    // Helper functions
    function log(message, level = 'info') {
        const validLevels = ['log', 'info', 'warn', 'error', 'debug'];
        const logLevel = validLevels.includes(level) ? level : 'log';
        console[logLevel](`[${new Date().toISOString()}] ${message}`);
    }

    function isTravelTimerActive() {
        const timerElement = document.querySelector(SELECTORS.TRAVEL_TIMER);
        if (timerElement) {
            const timerText = timerElement.textContent.trim();
            const timePattern = /^\d{2}:\d{2}:\d{2}$/;
            if (timePattern.test(timerText)) {
                log(`Travel timer active: ${timerText}`);
                return true;
            }
        }
        return false;
    }

    function updateStatus(message, level = 'info', data = {}) {
        if (isTraveling) return;

        const oldStatus = document.querySelector('.bk-auto-travel-status');
        if (oldStatus) oldStatus.remove();

        const statusDiv = document.createElement('div');
        statusDiv.className = `bk-auto-travel-status ${level}`;

        let statusHTML = `<div class="bk-status-header">Dragon Mission Status</div>`;

        if (data.currentCity) {
            statusHTML += `
                <div class="bk-status-section">
                    <span class="bk-status-label">Current City:</span>
                    <span class="bk-status-value current">${data.currentCity}</span>
                </div>
            `;
        }

        if (data.targetCity) {
            statusHTML += `
                <div class="bk-status-section">
                    <span class="bk-status-label">Dragon at:</span>
                    <span class="bk-status-value dragon">${data.targetCity}</span>
                </div>
            `;
        }

        if (data.nextCity) {
            statusHTML += `
                <div class="bk-status-section">
                    <span class="bk-status-label">Traveling to:</span>
                    <span class="bk-status-value next">${data.nextCity}</span>
                </div>
            `;
        }

        if (data.path && data.path.length > 0) {
            let pathHTML = '<div class="bk-path-display">';
            pathHTML += '<span class="bk-status-label">Path:</span> ';

            data.path.forEach((city, index) => {
                const isCurrent = city === data.currentCity;
                const isNext = city === data.nextCity;
                const isFuture = index > data.path.indexOf(data.currentCity);

                let stepClass = 'bk-path-step';
                if (isCurrent) stepClass += ' current';
                if (isNext) stepClass += ' next';
                if (isFuture) stepClass += ' future';

                pathHTML += `<span class="${stepClass}">${city}</span>`;

                if (index < data.path.length - 1) {
                    pathHTML += '<span class="bk-path-arrow">→</span>';
                }
            });

            pathHTML += '</div>';
            statusHTML += pathHTML;
        }

        if (data.progress) {
            statusHTML += `
                <div class="bk-progress-bar">
                    <div class="bk-progress-fill" style="width: ${data.progress}%"></div>
                </div>
            `;
        }

        if (data.timer) {
            statusHTML += `<div class="bk-timer">${data.timer}</div>`;
        }

        if (isTravelTimerActive() && travelDestination) {
            statusHTML += `
                <div class="bk-status-section" style="background: rgba(255, 193, 7, 0.2); border-left: 3px solid #FFC107;">
                    <span class="bk-status-label">Traveling to:</span>
                    <span class="bk-status-value next">${travelDestination}</span>
                    <br>
                    <small>Waiting for travel to complete...</small>
                </div>
            `;
        }

        // Karma toggle
        const currentKarma = getKarma();
        statusHTML += `
            <div class="bk-karma-toggle">
                <span class="bk-karma-label">Karma:</span>
                <button class="bk-karma-btn light ${currentKarma === 'Good' ? 'active' : ''}" data-karma="Good">Light</button>
                <button class="bk-karma-btn dark ${currentKarma === 'Evil' ? 'active' : ''}" data-karma="Evil">Dark</button>
            </div>
        `;

        // Ruby fallback toggle
        const useRubies = getUseRubies();
        statusHTML += `
            <div class="bk-ruby-toggle">
                <span class="bk-ruby-label">Use Rubies:</span>
                <button class="bk-ruby-btn off ${!useRubies ? 'active' : ''}" data-ruby="false">Off</button>
                <button class="bk-ruby-btn on ${useRubies ? 'active' : ''}" data-ruby="true">On</button>
            </div>
        `;

        statusHTML += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1)">${message}</div>`;

        if (localStorage.getItem("autoTravelStarted") && !isTraveling) {
            statusHTML += `<button class="bk-stop-button">Stop Auto-Travel</button>`;
        } else if (window.location.href.includes("world/location") && !isTraveling) {
            statusHTML += `<button class="bk-start-button">Start Dragon Auto-Travel</button>`;
        }

        statusDiv.innerHTML = statusHTML;

        // Karma toggle click handlers
        const karmaButtons = statusDiv.querySelectorAll('.bk-karma-btn');
        karmaButtons.forEach(btn => {
            btn.onclick = function() {
                const karma = this.getAttribute('data-karma');
                setKarma(karma);
                const currentCity = data.currentCity || localStorage.getItem('currentCity') || '';
                const targetCity = data.targetCity || localStorage.getItem('dragonLocation') || '';
                updateStatus(`Karma set to ${karma === 'Good' ? 'Light' : 'Dark'}`, 'info', {
                    currentCity: currentCity,
                    targetCity: targetCity
                });
            };
        });

        // Ruby toggle click handlers
        const rubyButtons = statusDiv.querySelectorAll('.bk-ruby-btn');
        rubyButtons.forEach(btn => {
            btn.onclick = function() {
                const value = this.getAttribute('data-ruby') === 'true';
                setUseRubies(value);
                const currentCity = data.currentCity || localStorage.getItem('currentCity') || '';
                const targetCity = data.targetCity || localStorage.getItem('dragonLocation') || '';
                updateStatus(`Use rubies set to ${value ? 'On' : 'Off'}`, 'info', {
                    currentCity: currentCity,
                    targetCity: targetCity
                });
            };
        });

        const startButton = statusDiv.querySelector('.bk-start-button');
        if (startButton) {
            startButton.onclick = function() {
                localStorage.setItem("autoTravelStarted", "true");
                updateStatus("Manual start triggered. Going to travel page...", 'info', data);
                setTimeout(() => {
                    window.location.href = URLS.TRAVEL;
                }, 1000);
            };
        }

        const stopButton = statusDiv.querySelector('.bk-stop-button');
        if (stopButton) {
            stopButton.onclick = function() {
                localStorage.removeItem("autoTravelStarted");
                isTraveling = false;
                travelInitiated = false;
                travelDestination = null;
                updateStatus("Auto-travel stopped by user.", 'error', data);
                if (document.querySelector('.bk-traveling-overlay')) {
                    document.querySelector('.bk-traveling-overlay').remove();
                }
            };
        }

        document.body.appendChild(statusDiv);

        if (level === 'success' || message.includes('completed') || message.includes('purchased')) {
            setTimeout(() => {
                if (statusDiv.parentNode) {
                    statusDiv.style.opacity = '0';
                    statusDiv.style.transition = 'opacity 0.5s ease';
                    setTimeout(() => {
                        if (statusDiv.parentNode) statusDiv.remove();
                    }, 500);
                }
            }, 3000);
        }
    }

    function showTravelingOverlay(fromCity, toCity) {
        const oldOverlay = document.querySelector('.bk-traveling-overlay');
        if (oldOverlay) oldOverlay.remove();

        const overlay = document.createElement('div');
        overlay.className = 'bk-traveling-overlay';
        overlay.innerHTML = `
            <div class="bk-traveling-message">
                <div class="bk-traveling-spinner"></div>
                <h3>Traveling...</h3>
                <p>From <strong style="color: #4CAF50">${fromCity}</strong> to <strong style="color: #2196F3">${toCity}</strong></p>
                <p>Please wait while travel completes...</p>
                <p style="font-size: 12px; color: #aaa; margin-top: 20px;">Page will reload automatically</p>
                <button class="bk-stop-button" style="margin-top: 15px; background: linear-gradient(135deg, #f44336, #d32f2f); color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%;">Stop Auto-Travel</button>
            </div>
        `;

        const overlayStopBtn = overlay.querySelector('.bk-stop-button');
        if (overlayStopBtn) {
            overlayStopBtn.onclick = function() {
                localStorage.removeItem("autoTravelStarted");
                isTraveling = false;
                travelInitiated = false;
                travelDestination = null;
                overlay.remove();
                updateStatus("Auto-travel stopped by user.", 'error', {});
            };
        }

        document.body.appendChild(overlay);
        isTraveling = true;
    }

    function removeTravelingOverlay() {
        const overlay = document.querySelector('.bk-traveling-overlay');
        if (overlay) overlay.remove();
        isTraveling = false;
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Main functions
    function getCurrentLocation() {
        try {
            const cityElement = document.querySelector(SELECTORS.CITY_ELEMENT);
            if (cityElement) {
                const currentLocation = cityElement.textContent.trim();
                log("Current location: " + currentLocation);
                return currentLocation;
            }
            throw new Error("Current city element not found.");
        } catch (error) {
            log(error.message, 'error');
            return null;
        }
    }

    function getDragonLocation() {
        if (isTravelTimerActive()) {
            log("Travel timer active, returning cached Dragon location");
            return currentDragonLocation;
        }

        const dragonIcon = document.querySelector(SELECTORS.DRAGON_ICON);
        if (dragonIcon) {
            const targetCityClass = dragonIcon.className;

            if (reverseCityMappings.has(targetCityClass)) {
                const cityName = reverseCityMappings.get(targetCityClass);
                log("Dragon's location: " + cityName);
                currentDragonLocation = cityName;
                localStorage.setItem('dragonLocation', cityName);
                return cityName;
            }

            const classList = dragonIcon.classList;
            for (const className of classList) {
                if (reverseCityMappings.has(className)) {
                    const cityName = reverseCityMappings.get(className);
                    log("Dragon's location: " + cityName);
                    currentDragonLocation = cityName;
                    localStorage.setItem('dragonLocation', cityName);
                    return cityName;
                }
            }

            log(`Warning: Could not map class "${targetCityClass}" to any city.`, 'warn');
        } else {
            log("Dragon icon not found on page.", 'error');
        }

        const cachedLocation = localStorage.getItem('dragonLocation');
        if (cachedLocation) {
            log("Using cached Dragon location from localStorage: " + cachedLocation);
            currentDragonLocation = cachedLocation;
            return cachedLocation;
        }

        return currentDragonLocation;
    }

    // Breadth-First Search (BFS) to find the shortest path to Dragon's location
    function findShortestPath(startCity, targetCity) {
        const queue = [[startCity]];
        const visited = new Set();

        while (queue.length > 0) {
            const path = queue.shift();
            const currentCity = path[path.length - 1];

            if (currentCity === targetCity) {
                return path;
            }

            if (!visited.has(currentCity)) {
                visited.add(currentCity);

                const neighbors = travelPaths.get(currentCity) || [];
                for (const neighbor of neighbors) {
                    queue.push([...path, neighbor]);
                }
            }
        }

        log(`No path found from ${startCity} to ${targetCity}`, 'error');
        return null;
    }

    function getNextCity(currentCity, targetCity) {
        const shortestPath = findShortestPath(currentCity, targetCity);
        if (shortestPath && shortestPath.length > 1) {
            return shortestPath[1];
        }
        log(`No available travel paths from ${currentCity}`, 'error');
        return null;
    }

    async function travelTo(targetCity, currentCity, fullPath) {
        travelInitiated = true;
        travelDestination = targetCity;

        log(`Searching for the travel button for ${targetCity}...`);

        showTravelingOverlay(currentCity, targetCity);

        const statusDiv = document.querySelector('.bk-auto-travel-status');
        if (statusDiv) statusDiv.remove();

        const buttonName = cityMappings.get(targetCity);
        if (!buttonName) {
            log(`No button name found for city: ${targetCity}`, 'error');
            travelInitiated = false;
            travelDestination = null;
            removeTravelingOverlay();
            return;
        }

        if (targetCity === "Alvan" || targetCity === "Waile") {
            let specialButton = null;
            const allButtons = document.querySelectorAll('a.button');

            for (const button of allButtons) {
                const onclick = button.getAttribute('onclick');
                if (onclick) {
                    if (targetCity === "Alvan" && onclick.includes("startTravel('HarbourTwo'")) {
                        specialButton = button;
                        break;
                    } else if (targetCity === "Waile" && onclick.includes("startTravel('HarbourOne'")) {
                        specialButton = button;
                        break;
                    }
                }
            }

            if (specialButton) {
                log(`Clicking special travel button for ${targetCity}...`);
                specialButton.click();

                localStorage.setItem("currentCity", targetCity);

                setTimeout(() => {
                    travelInitiated = false;
                    travelDestination = null;
                    window.location.href = URLS.LOCATION;
                }, 3000);
                return;
            }
        }

        const travelButtons = document.querySelectorAll(SELECTORS.TRAVEL_BUTTON);
        let targetButton = null;

        for (const button of travelButtons) {
            const onclickAttribute = button.getAttribute('onclick');
            if (onclickAttribute && onclickAttribute.includes(`startTravel('${buttonName}'`) && !onclickAttribute.includes(", true")) {
                targetButton = button;
                break;
            }
        }

        if (targetButton) {
            log(`Traveling to ${targetCity}...`);
            targetButton.click();
            localStorage.setItem("currentCity", targetCity);

            setTimeout(() => {
                travelInitiated = false;
                travelDestination = null;
                window.location.href = URLS.LOCATION;
            }, 3000);
        } else {
            log(`Already at ${targetCity} or cannot find button.`, 'info');
            travelInitiated = false;
            travelDestination = null;
            removeTravelingOverlay();
            window.location.href = URLS.LOCATION;
        }
    }

    // Perform the dragon large mission
    function performDragonMission() {
        const dragonEvent = document.querySelector(SELECTORS.DRAGON_EVENT);
        if (!dragonEvent) {
            log("Dragon event not found on this page.", 'warn');
            return false;
        }

        const karma = getKarma();
        const useRubies = getUseRubies();
        log(`Looking for ${karma} karma mission button...`);

        function isVisible(el) {
            return el.offsetParent !== null;
        }

        // Collect all possible mission buttons
        const allCandidates = document.querySelectorAll('a[onclick*="chooseMission"]');
        let freeBtn = null;
        let rubyBtn = null;

        for (const btn of allCandidates) {
            const onclick = btn.getAttribute('onclick');
            if (!onclick || !onclick.includes(`chooseMission('large', 'DragonEventGreatDragon', '${karma}'`)) continue;

            const isRuby = /,\s*'\d'\)/.test(onclick);
            if (!isRuby && !freeBtn) freeBtn = btn;
            if (isRuby && !rubyBtn) rubyBtn = btn;
        }

        // Try free button first if visible
        if (freeBtn && isVisible(freeBtn)) {
            log(`Clicking ${karma} (${karma === 'Good' ? 'Light' : 'Dark'}) karma mission (free)!`);
            freeBtn.click();
            return true;
        }

        // Fallback to ruby button if enabled and visible
        if (useRubies && rubyBtn && isVisible(rubyBtn)) {
            const match = rubyBtn.getAttribute('onclick').match(/,\s*'(\d)'\)/);
            const cost = match ? match[1] : '?';
            log(`Clicking ${karma} (${karma === 'Good' ? 'Light' : 'Dark'}) karma mission (${cost} ruby)!`);
            rubyBtn.click();
            return true;
        }

        // Nothing visible — report what was found
        if (freeBtn) log("Free button exists but is not visible.", 'warn');
        if (rubyBtn) log("Ruby button exists but is not visible.", 'warn');
        if (!freeBtn && !rubyBtn) log(`No ${karma} karma mission button found on page.`, 'warn');
        if (!useRubies && rubyBtn) log("Ruby fallback is disabled. Toggle 'Use Rubies' on to try it.", 'info');

        return false;
    }

    // Entry point for the location page
    async function handleLocationPage() {
        log("On location page...");

        isTraveling = false;
        travelInitiated = false;
        travelDestination = null;

        const currentCity = getCurrentLocation();
        if (!currentCity) {
            updateStatus("Cannot determine current location.", 'error');
            return;
        }

        // Check if auto travel has been started
        if (!localStorage.getItem("autoTravelStarted")) {
            updateStatus("Ready to start. Click the button below!", 'info', {
                currentCity: currentCity
            });
            return;
        }

        // Check if we're at the dragon's city and dragon event is present
        const dragonCity = localStorage.getItem('dragonLocation');
        if (dragonCity === currentCity) {
            const dragonEvent = document.querySelector(SELECTORS.DRAGON_EVENT);
            if (dragonEvent) {
                updateStatus("At dragon's city! Performing mission...", 'success', {
                    currentCity: currentCity,
                    targetCity: dragonCity
                });

                await delay(2000);

                const missionClicked = performDragonMission();
                if (missionClicked) {
                    updateStatus("Mission started! Waiting for completion...", 'success', {
                        currentCity: currentCity,
                        targetCity: dragonCity
                    });

            // After mission, wait then hard refresh the page to clear report screen
                    await delay(10000);
                    updateStatus("Mission done! Refreshing to continue loop...", 'success', {
                        currentCity: currentCity,
                        targetCity: dragonCity
                    });
                    location.reload();
                } else {
                    updateStatus("Failed to start mission. Clearing stale location and retrying...", 'warning', {
                        currentCity: currentCity,
                        targetCity: dragonCity
                    });
                    localStorage.removeItem('dragonLocation');
                    await delay(5000);
                    window.location.href = URLS.TRAVEL;
                }
                return;
            } else {
                // Dragon event not found at cached city — location is stale
                log("Dragon event not found at " + dragonCity + ", clearing stale location.", 'warn');
                localStorage.removeItem('dragonLocation');
            }
        }

        updateStatus("Updating location information...", 'info', {
            currentCity: currentCity
        });

        localStorage.setItem("currentCity", currentCity);

        await delay(2000);
        updateStatus("Going to travel page to check Dragon location...", 'info', {
            currentCity: currentCity
        });
        window.location.href = URLS.TRAVEL;
    }

    // Entry point for the travel page
    async function handleTravelPage() {
        log("On travel page...");

        isTraveling = false;
        travelInitiated = false;
        travelDestination = null;

        if (isTravelTimerActive()) {
            const cachedDragonLocation = localStorage.getItem('dragonLocation');
            const currentCity = localStorage.getItem("currentCity") || getCurrentLocation();

            updateStatus("Travel in progress...", 'info', {
                currentCity: currentCity,
                targetCity: cachedDragonLocation || "Unknown",
                timer: "Waiting for travel to complete"
            });

            return;
        }

        if (!localStorage.getItem("autoTravelStarted")) {
            localStorage.setItem("autoTravelStarted", "true");
        }

        await delay(3000);

        let currentCity = localStorage.getItem("currentCity");

        if (!currentCity) {
            currentCity = getCurrentLocation();
            if (currentCity) {
                localStorage.setItem("currentCity", currentCity);
            } else {
                updateStatus("Cannot determine current city. Going back to location page.", 'error');
                setTimeout(() => {
                    window.location.href = URLS.LOCATION;
                }, 3000);
                return;
            }
        }

        const targetCity = getDragonLocation();
        if (!targetCity) {
            if (!isTravelTimerActive()) {
                updateStatus("Cannot find Dragon location. Refreshing page...", 'warning', {
                    currentCity: currentCity
                });
                setTimeout(() => {
                    location.reload();
                }, 5000);
            } else {
                updateStatus("Travel in progress... Can't check Dragon while traveling.", 'info', {
                    currentCity: currentCity,
                    timer: "Waiting for travel to complete"
                });
            }
            return;
        }

        localStorage.setItem('dragonLocation', targetCity);

        if (currentCity === targetCity) {
            updateStatus("Already at Dragon's city! Going to location page...", 'success', {
                currentCity: currentCity,
                targetCity: targetCity
            });
            setTimeout(() => {
                window.location.href = URLS.LOCATION;
            }, 2000);
            return;
        }

        const path = findShortestPath(currentCity, targetCity);
        if (!path || path.length < 2) {
            updateStatus("Cannot find path to Dragon. Trying direct approach...", 'warning', {
                currentCity: currentCity,
                targetCity: targetCity
            });
            setTimeout(() => {
                window.location.href = URLS.LOCATION;
            }, 3000);
            return;
        }

        const nextCity = path[1];

        updateStatus("Planning route to Dragon...", 'info', {
            currentCity: currentCity,
            targetCity: targetCity,
            nextCity: nextCity,
            path: path
        });

        await delay(2000);
        await travelTo(nextCity, currentCity, path);
    }

    // Main entry point
    if (window.location.href.includes("world/location")) {
        handleLocationPage();
    } else if (window.location.href.includes("world/travel")) {
        handleTravelPage();
    } else if (localStorage.getItem("autoTravelStarted")) {
        // On a report/mission result page - redirect back to location to continue loop
        log("On unknown page (likely report screen), redirecting to location...");
        setTimeout(() => {
            window.location.href = URLS.LOCATION;
        }, 3000);
    }
})();
