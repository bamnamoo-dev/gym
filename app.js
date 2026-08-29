document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        mode: 'short', 
        rates: {
            sports: { small: 15000, medium: 20000, large: 25000 },
            event: { small: 40000, medium: 50000, large: 60000 }
        },
        lightRate: 5000,
        size: 'medium',
        duration: 2,
        category: 'none',
        startDate: '',
        endDate: '',
        selectedDays: [],
        excludeHolidays: false,
        baseExcludeDates: '',
        baseAdjDays: 0,
        
        // Facilities State
        useLighting: false,
        lightStart: '',
        lightEnd: '',
        lightHours: 2,
        lightExcludeDates: '',
        lightAdjDays: 0,

        useCooling: false,
        coolingStart: '',
        coolingEnd: '',
        coolingHours: 2,
        coolingExcludeDates: '',
        coolingAdjDays: 0,

        useHeating: false,
        heatingStart: '',
        heatingEnd: '',
        heatingHours: 2,
        heatingExcludeDates: '',
        heatingAdjDays: 0,

        theme: 'dark'
    };

    /**
     * Korea Astronomy and Space Science Institute (KASI) OpenAPI Key
     */
    const KASI_SERVICE_KEY = 'b113563a7b1c40fb60e0a94a853920c7bb87ff909735da575821a42e2de9e065';
    const apiHolidays = {}; // Cache: { 'YYYY-MM-DD': 'Holiday Name' }
    const loadedYears = new Set();

    /**
     * Fetch holidays from KASI OpenAPI with localStorage caching & fallback
     */
    async function fetchHolidaysForYear(year) {
        if (loadedYears.has(year)) return;
        const cacheKey = `kasi_holidays_${year}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                Object.assign(apiHolidays, parsed);
                loadedYears.add(year);
                return;
            } catch (e) {
                console.error('Cache parsing error', e);
            }
        }

        try {
            const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${KASI_SERVICE_KEY}&solYear=${year}&_type=json&numOfRows=100`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            const items = data?.response?.body?.items?.item;
            const list = Array.isArray(items) ? items : (items ? [items] : []);
            
            const yearHolidays = {};
            list.forEach(item => {
                if (item.isHoliday === 'Y') {
                    const locdate = String(item.locdate);
                    const formatted = `${locdate.slice(0, 4)}-${locdate.slice(4, 6)}-${locdate.slice(6, 8)}`;
                    yearHolidays[formatted] = item.dateName;
                    apiHolidays[formatted] = item.dateName;
                }
            });

            localStorage.setItem(cacheKey, JSON.stringify(yearHolidays));
            loadedYears.add(year);
        } catch (err) {
            console.warn(`Failed to fetch official holidays for ${year} via OpenAPI, falling back to built-in calendar logic:`, err);
        }
    }

    async function ensureHolidaysForRange(startStr, endStr) {
        if (!startStr) return;
        const startYear = new Date(startStr).getFullYear();
        const endYear = endStr ? new Date(endStr).getFullYear() : startYear;
        const promises = [];
        for (let y = Math.min(startYear, endYear); y <= Math.max(startYear, endYear); y++) {
            if (!loadedYears.has(y)) {
                promises.push(fetchHolidaysForYear(y));
            }
        }
        if (promises.length > 0) {
            await Promise.all(promises);
            updateUI();
        }
    }

    /**
     * Lunar Holiday Database (2026-2035) Fallback
     * Includes Seollal (3 days), Chuseok (3 days), and Buddha's Birthday
     */
    const LUNAR_HOLIDAYS = {
        2026: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-05-24', '2026-05-25', '2026-09-24', '2026-09-25', '2026-09-26'],
        2027: ['2027-02-06', '2027-02-07', '2027-02-08', '2027-05-13', '2027-09-14', '2027-09-15', '2027-09-16'],
        2028: ['2028-01-26', '2028-01-27', '2028-01-28', '2028-05-02', '2028-09-30', '2028-10-01', '2028-10-02'],
        2029: ['2029-02-12', '2029-02-13', '2029-02-14', '2029-05-20', '2029-09-21', '2029-09-22', '2029-09-23'],
        2030: ['2030-02-02', '2030-02-03', '2030-02-04', '2030-05-09', '2030-09-11', '2030-09-12', '2030-09-13'],
        2031: ['2031-01-22', '2031-01-23', '2031-01-24', '2031-05-28', '2031-09-30', '2031-10-01', '2031-10-02'],
        2032: ['2032-02-10', '2032-02-11', '2032-02-12', '2032-05-16', '2032-09-18', '2032-09-19', '2032-09-20'],
        2033: ['2033-01-30', '2033-01-31', '2033-02-01', '2033-05-06', '2033-09-07', '2033-09-08', '2033-09-09'],
        2034: ['2034-02-18', '2034-02-19', '2034-02-20', '2034-05-25', '2034-09-26', '2034-09-27', '2034-09-28'],
        2035: ['2035-02-07', '2035-02-08', '2035-02-09', '2035-05-15', '2035-09-15', '2035-09-16', '2035-09-17']
    };

    const $ = (id) => document.getElementById(id);

    // DOM Elements
    const btnShort = $('mode-short');
    const btnLong = $('mode-long');
    const weekdayContainer = $('weekday-selection-container');
    const dateLabel = $('date-label');
    const startDateInput = $('start-date');
    const endDateInput = $('end-date');
    const weekdayChecks = document.querySelectorAll('.day-check input');
    const excludeHolidaysCheck = $('exclude-holidays');
    const baseExcludeDatesInput = $('base-exclude-dates');
    const baseAdjDaysInput = $('base-adj-days');
    const gymSizeSelect = $('gym-size');
    const durationInput = $('duration');
    const durationVal = $('duration-val');
    const categorySelect = $('category');

    // Facilities DOM
    const useLightingCheck = $('use-lighting');
    const lightingDetails = $('lighting-details');
    const lightStartInput = $('light-start');
    const lightEndInput = $('light-end');
    const lightHoursInput = $('light-hours');
    const lightExcludeDatesInput = $('light-exclude-dates');
    const lightAdjDaysInput = $('light-adj-days');

    const useCoolingCheck = $('use-cooling');
    const coolingDetails = $('cooling-details');
    const coolingStartInput = $('cooling-start');
    const coolingEndInput = $('cooling-end');
    const coolingHoursInput = $('cooling-hours');
    const coolingExcludeDatesInput = $('cooling-exclude-dates');
    const coolingAdjDaysInput = $('cooling-adj-days');

    const useHeatingCheck = $('use-heating');
    const heatingDetails = $('heating-details');
    const heatingStartInput = $('heating-start');
    const heatingEndInput = $('heating-end');
    const heatingHoursInput = $('heating-hours');
    const heatingExcludeDatesInput = $('heating-exclude-dates');
    const heatingAdjDaysInput = $('heating-adj-days');

    // Result DOM
    const resSessionCount = $('res-session-count');
    const resTotalHours = $('res-total-hours');
    const resBase = $('res-base');
    const baseMath = $('base-math');
    const discountedBaseRow = $('discounted-base-row');
    const resDiscountedBase = $('res-discounted-base');
    const discountedBaseMath = $('discounted-base-math');
    const lightingRow = $('lighting-row');
    const resLighting = $('res-lighting');
    const lightMath = $('light-math');
    const coolingRow = $('cooling-row');
    const resCooling = $('res-cooling');
    const coolingMath = $('cooling-math');
    const heatingRow = $('heating-row');
    const resHeating = $('res-heating');
    const heatingMath = $('heating-math');
    const holidayRow = $('holiday-row');
    const resHolidayCount = $('res-holiday-count');
    const holidayMath = $('holiday-math');
    const resSubtotal = $('res-subtotal');
    const resDiscountLabel = $('res-discount-label');
    const resDiscount = $('res-discount');
    const hvacTotalRow = $('hvac-total-row');
    const resHvacTotal = $('res-hvac-total');
    const resTotal = $('res-total');
    
    const themeToggle = $('theme-toggle');
    const modal = $('settings-modal');
    const btnSettings = $('btn-settings');
    const btnCloseModal = document.querySelector('.close-modal');
    const btnSaveSettings = $('btn-save-settings');
    const btnPrint = $('btn-print');

    // Initialization
    initDates();
    loadSettings();
    applyTheme();
    ensureHolidaysForRange(state.startDate, state.endDate);
    updateUI();

    function initDates() {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        state.startDate = dateStr;
        state.endDate = dateStr;
        if (startDateInput) startDateInput.value = dateStr;
        if (endDateInput) endDateInput.value = dateStr;

        ['light', 'cooling', 'heating'].forEach(key => {
            state[`${key}Start`] = dateStr;
            state[`${key}End`] = dateStr;
            const sIn = $(`${key}-start`);
            const eIn = $(`${key}-end`);
            if (sIn) sIn.value = dateStr;
            if (eIn) eIn.value = dateStr;
        });

        state.selectedDays = [2, 4];
        weekdayChecks.forEach(check => {
            if (state.selectedDays.includes(parseInt(check.value))) check.checked = true;
        });
    }

    // Theme Logic
    if (themeToggle) themeToggle.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme();
        saveSettings();
    });

    function applyTheme() {
        document.body.setAttribute('data-theme', state.theme);
        const icon = themeToggle.querySelector('i');
        if (state.theme === 'light') {
            icon.className = 'fas fa-sun';
            themeToggle.title = '다크 모드로 변경';
        } else {
            icon.className = 'fas fa-moon';
            themeToggle.title = '라이트 모드로 변경';
        }
    }

    // Event Listeners
    if (btnShort) btnShort.addEventListener('click', () => {
        state.mode = 'short';
        btnShort.classList.add('active');
        if (btnLong) btnLong.classList.remove('active');
        if (weekdayContainer) weekdayContainer.classList.add('hidden');
        updateUI();
    });

    if (btnLong) btnLong.addEventListener('click', () => {
        state.mode = 'long';
        btnLong.classList.add('active');
        if (btnShort) btnShort.classList.remove('active');
        if (weekdayContainer) weekdayContainer.classList.remove('hidden');
        if (state.category === 'none') {
            state.category = 'resident-long';
            if (categorySelect) categorySelect.value = 'resident-long';
        }
        updateUI();
    });

    if (startDateInput) startDateInput.addEventListener('change', (e) => { 
        state.startDate = e.target.value; 
        ensureHolidaysForRange(state.startDate, state.endDate);
        updateUI(); 
    });
    if (endDateInput) endDateInput.addEventListener('change', (e) => { 
        state.endDate = e.target.value; 
        ensureHolidaysForRange(state.startDate, state.endDate);
        updateUI(); 
    });
    if (excludeHolidaysCheck) excludeHolidaysCheck.addEventListener('change', (e) => { state.excludeHolidays = e.target.checked; updateUI(); });
    if (baseExcludeDatesInput) baseExcludeDatesInput.addEventListener('input', (e) => { state.baseExcludeDates = e.target.value; updateUI(); });
    if (baseAdjDaysInput) baseAdjDaysInput.addEventListener('input', (e) => { state.baseAdjDays = parseInt(e.target.value) || 0; updateUI(); });

    weekdayChecks.forEach(check => {
        check.addEventListener('change', () => {
            state.selectedDays = Array.from(weekdayChecks).filter(c => c.checked).map(c => parseInt(c.value));
            updateUI();
        });
    });

    const setupFacility = (key, checkEl, detailsEl, startEl, endEl, hoursEl, excludeEl, adjEl) => {
        if (checkEl) checkEl.addEventListener('change', (e) => {
            state[`use${key.charAt(0).toUpperCase() + key.slice(1)}`] = e.target.checked;
            if (detailsEl) detailsEl.classList.toggle('hidden', !e.target.checked);
            updateUI();
        });
        if (startEl) startEl.addEventListener('change', (e) => { state[`${key}Start`] = e.target.value; updateUI(); });
        if (endEl) endEl.addEventListener('change', (e) => { state[`${key}End`] = e.target.value; updateUI(); });
        if (hoursEl) hoursEl.addEventListener('input', (e) => { state[`${key}Hours`] = parseInt(e.target.value) || 0; updateUI(); });
        if (excludeEl) excludeEl.addEventListener('input', (e) => { state[`${key}ExcludeDates`] = e.target.value; updateUI(); });
        if (adjEl) adjEl.addEventListener('input', (e) => { state[`${key}AdjDays`] = parseInt(e.target.value) || 0; updateUI(); });
    };

    setupFacility('light', useLightingCheck, lightingDetails, lightStartInput, lightEndInput, lightHoursInput, lightExcludeDatesInput, lightAdjDaysInput);
    setupFacility('cooling', useCoolingCheck, coolingDetails, coolingStartInput, coolingEndInput, coolingHoursInput, coolingExcludeDatesInput, coolingAdjDaysInput);
    setupFacility('heating', useHeatingCheck, heatingDetails, heatingStartInput, heatingEndInput, heatingHoursInput, heatingExcludeDatesInput, heatingAdjDaysInput);

    if (gymSizeSelect) gymSizeSelect.addEventListener('change', (e) => { state.size = e.target.value; updateUI(); });
    if (durationInput) durationInput.addEventListener('input', (e) => {
        state.duration = parseInt(e.target.value);
        if (durationVal) durationVal.textContent = `${state.duration}시간`;
        updateUI();
    });
    if (categorySelect) categorySelect.addEventListener('change', (e) => { state.category = e.target.value; updateUI(); });

    if (btnSettings) btnSettings.addEventListener('click', () => {
        if ($('set-rate-small')) $('set-rate-small').value = state.rates.sports.small;
        if ($('set-rate-medium')) $('set-rate-medium').value = state.rates.sports.medium;
        if ($('set-rate-large')) $('set-rate-large').value = state.rates.sports.large;
        if ($('set-light-rate')) $('set-light-rate').value = state.lightRate;
        if (modal) modal.classList.add('active');
    });

    if (btnCloseModal) btnCloseModal.addEventListener('click', () => modal && modal.classList.remove('active'));
    if (btnSaveSettings) btnSaveSettings.addEventListener('click', () => {
        state.rates.sports.small = parseInt($('set-rate-small').value) || 0;
        state.rates.sports.medium = parseInt($('set-rate-medium').value) || 0;
        state.rates.sports.large = parseInt($('set-rate-large').value) || 0;
        state.lightRate = parseInt($('set-light-rate').value) || 0;
        saveSettings(); updateUI(); if (modal) modal.classList.remove('active');
    });

    if (btnPrint) btnPrint.addEventListener('click', () => { window.print(); });

    function updateUI() {
        const isEvent = state.category === 'none';
        const rateSet = isEvent ? state.rates.event : state.rates.sports;
        const baseRate = rateSet[state.size];
        
        const allowedDays = state.mode === 'long' ? state.selectedDays : [0,1,2,3,4,5,6];
        const rawSessionDates = getSessionDates(state.startDate, state.endDate, allowedDays, state.excludeHolidays);
        
        const parseExcluded = (str) => str.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const baseExcludes = parseExcluded(state.baseExcludeDates);
        const sessionDates = rawSessionDates.filter(d => !baseExcludes.includes(d));
        const totalSessions = Math.max(0, sessionDates.length + state.baseAdjDays);
        
        const calcFacSessions = (use, start, end, excludeStr, adjDays) => {
            if (!use) return 0;
            const excludes = parseExcluded(excludeStr);
            const count = sessionDates.filter(d => isWithinRange(d, start, end) && !excludes.includes(d)).length;
            return Math.max(0, count + adjDays);
        };

        const lightSessions = calcFacSessions(state.useLighting, state.lightStart, state.lightEnd, state.lightExcludeDates, state.lightAdjDays);
        const coolingSessions = calcFacSessions(state.useCooling, state.coolingStart, state.coolingEnd, state.coolingExcludeDates, state.coolingAdjDays);
        const heatingSessions = calcFacSessions(state.useHeating, state.heatingStart, state.heatingEnd, state.heatingExcludeDates, state.heatingAdjDays);

        const hvacSurchargeRate = baseRate * 0.2;
        const totalHours = totalSessions * state.duration;
        const baseAmount = totalSessions * state.duration * baseRate;
        const lightingAmount = lightSessions * state.lightHours * state.lightRate;
        const coolingAmount = coolingSessions * state.coolingHours * hvacSurchargeRate;
        const heatingAmount = heatingSessions * state.heatingHours * hvacSurchargeRate;
        
        const subtotal = baseAmount + lightingAmount + coolingAmount + heatingAmount;
        const discountRate = getDiscountRate(state.category);
        const discountAmount = Math.floor(baseAmount * discountRate);
        const discountedBaseAmount = baseAmount - discountAmount;
        const total = discountedBaseAmount + lightingAmount + coolingAmount + heatingAmount;

        setText(resSessionCount, `${totalSessions}${state.mode === 'long' ? '회' : '일'}`);
        setText(resTotalHours, `${formatNumber(totalHours)}시간`);
        setText(resBase, `${formatNumber(baseAmount)}원`);
        setText(baseMath, `단가 ${formatNumber(baseRate)}원 × ${state.duration}시간 × ${totalSessions}${state.mode === 'long' ? '회' : '일'}`);

        if (discountRate > 0) {
            updateVisibility(true, discountedBaseRow);
            updateVisibility(true, discountedBaseMath);
            setText(resDiscountedBase, `${formatNumber(discountedBaseAmount)}원`);
            setText(discountedBaseMath, `기본 ${formatNumber(baseAmount)}원 - 감면액 ${formatNumber(discountAmount)}원`);
        } else {
            updateVisibility(false, discountedBaseRow);
            updateVisibility(false, discountedBaseMath);
        }

        const updateFacRow = (use, row, resEl, mathEl, val, mathText) => {
            updateVisibility(use, row);
            updateVisibility(use, mathEl);
            if (use) {
                setText(resEl, `${formatNumber(val)}원`);
                setText(mathEl, mathText);
            }
        };

        const sessT = state.mode === 'long' ? '회' : '일';
        updateFacRow(state.useLighting, lightingRow, resLighting, lightMath, lightingAmount, `단가 ${formatNumber(state.lightRate)}원 × ${state.lightHours}시간 × ${lightSessions}${sessT}`);
        updateFacRow(state.useCooling, coolingRow, resCooling, coolingMath, coolingAmount, `기본료 20%(${formatNumber(hvacSurchargeRate)}원) × ${state.coolingHours}시간 × ${coolingSessions}${sessT}`);
        updateFacRow(state.useHeating, heatingRow, resHeating, heatingMath, heatingAmount, `기본료 20%(${formatNumber(hvacSurchargeRate)}원) × ${state.heatingHours}시간 × ${heatingSessions}${sessT}`);

        // Holidays during period
        const holidaysInRange = [];
        if (state.startDate && state.endDate) {
            const curH = new Date(state.startDate);
            const lastH = new Date(state.endDate);
            while (curH <= lastH) {
                const dStr = curH.toISOString().split('T')[0];
                if (allowedDays.includes(curH.getDay()) && isHoliday(dStr)) {
                    const hName = apiHolidays[dStr] || '공휴일';
                    const m = curH.getMonth() + 1;
                    const d = curH.getDate();
                    holidaysInRange.push(`${m}/${d}(${hName})`);
                }
                curH.setDate(curH.getDate() + 1);
            }
        }

        if (state.excludeHolidays) {
            setText(resHolidayCount, `${holidaysInRange.length}일 제외`);
            if (holidaysInRange.length > 0) {
                setText(holidayMath, holidaysInRange.join(', '));
            } else {
                setText(holidayMath, '선택 요일에 해당하는 공휴일 없음');
            }
        } else {
            setText(resHolidayCount, `${holidaysInRange.length}일 (미제외)`);
            if (holidaysInRange.length > 0) {
                setText(holidayMath, `${holidaysInRange.join(', ')} (사용일수에 포함됨)`);
            } else {
                setText(holidayMath, '공휴일 없음');
            }
        }

        setText(resSubtotal, `${formatNumber(subtotal)}원`);
        setText(resDiscountLabel, `${Math.round(discountRate * 100)}%`);
        setText(resDiscount, `-${formatNumber(discountAmount)}원`);

        // HVAC Total Row (Cooling + Heating)
        const hvacTotal = coolingAmount + heatingAmount;
        const showHvacTotal = state.useCooling || state.useHeating;
        updateVisibility(showHvacTotal, hvacTotalRow);
        if (showHvacTotal) {
            setText(resHvacTotal, `${formatNumber(hvacTotal)}원`);
        }

        animateNumber(resTotal, total);
        
        const resultBody = document.querySelector('.result-card .card-body');
        if (resultBody) {
            const now = new Date();
            resultBody.setAttribute('data-date', `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`);
        }
    }

    function setText(el, val) { if (el) el.textContent = val; }
    
    function isHoliday(dateStr) {
        // 0. Official KASI OpenAPI Holidays (includes temporary holidays, election days, official substitutes)
        if (apiHolidays[dateStr]) return true;

        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const dayOfWeek = date.getDay(); // 0: Sun, 6: Sat

        // 1. Solar Fixed Holidays
        const solarHolidays = [
            '01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'
        ];
        const mmdd = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        if (solarHolidays.includes(mmdd)) return true;

        // 2. Substitute Holidays for Solar (if Sat/Sun)
        // Simplified: If solar holiday is Sunday, next Monday is holiday.
        // If it's Saturday, some years/holidays have substitute (3.1, 8.15, 10.3, 10.9, 5.5).
        for (let h of solarHolidays) {
            const [hM, hD] = h.split('-').map(Number);
            const hDate = new Date(year, hM - 1, hD);
            const hDay = hDate.getDay();
            
            if (hDay === 0) { // Sunday
                const subDate = new Date(year, hM - 1, hD + 1);
                if (subDate.getTime() === date.getTime()) return true;
            } else if (hDay === 6 && ['03-01', '05-05', '08-15', '10-03', '10-09'].includes(h)) { // Saturday
                const subDate = new Date(year, hM - 1, hD + 2); // Next Monday
                if (subDate.getTime() === date.getTime()) return true;
            }
        }

        // 3. Lunar Holidays from Database (2026-2035)
        if (LUNAR_HOLIDAYS[year] && LUNAR_HOLIDAYS[year].includes(dateStr)) return true;

        // 4. Substitute for Lunar (if Sun)
        if (LUNAR_HOLIDAYS[year]) {
            for (let lH of LUNAR_HOLIDAYS[year]) {
                const lHDate = new Date(lH);
                if (lHDate.getDay() === 0) { // If any lunar holiday is Sunday
                    const subDate = new Date(lHDate);
                    subDate.setDate(subDate.getDate() + 1);
                    // If the subDate itself is already a lunar holiday, push further
                    while (LUNAR_HOLIDAYS[year].includes(subDate.toISOString().split('T')[0])) {
                        subDate.setDate(subDate.getDate() + 1);
                    }
                    if (subDate.getTime() === date.getTime()) return true;
                }
            }
        }

        return false;
    }

    function getSessionDates(start, end, allowedDays, skipHolidays) {
        if (!start || !end || allowedDays.length === 0) return [];
        const dates = [];
        const cur = new Date(start);
        const last = new Date(end);
        while (cur <= last) {
            const dateStr = cur.toISOString().split('T')[0];
            const isAllowedDay = allowedDays.includes(cur.getDay());
            if (isAllowedDay && !(skipHolidays && isHoliday(dateStr))) dates.push(dateStr);
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    }

    function isWithinRange(dateStr, start, end) { return start && end && dateStr >= start && dateStr <= end; }
    function updateVisibility(isActive, element) { if (element) element.classList.toggle('hidden', !isActive); }
    function animateNumber(element, target) {
        if (!element) return;
        const current = parseInt(element.textContent.replace(/,/g, '')) || 0;
        const duration = 500;
        const start = performance.now();
        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            element.textContent = formatNumber(Math.floor(progress * (target - current) + current));
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }
    function getDiscountRate(category) {
        switch (category) {
            case 'resident-long': return 0.6;
            case 'vulnerable': return 0.5;
            case 'worker-long': return 0.4;
            case 'official': return 1.0;
            default: return 0;
        }
    }
    function formatNumber(num) { return num.toLocaleString(); }
    function saveSettings() { localStorage.setItem('school-gym-rates-v5', JSON.stringify({ rates: state.rates, lightRate: state.lightRate, theme: state.theme })); }
    function loadSettings() {
        const saved = localStorage.getItem('school-gym-rates-v5');
        if (saved) {
            const data = JSON.parse(saved);
            if (data.rates) state.rates = data.rates;
            state.lightRate = data.lightRate;
            state.theme = data.theme || 'dark';
        }
    }
});
