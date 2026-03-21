// ── Tab bar ──────────────────────────────────────────────────────
(function () {
    var tabs = Array.from(document.querySelectorAll('.foos-tab'));
    tabs.forEach(function (tab, index) {
        tab.addEventListener('keydown', function (e) {
            var next;
            if (e.key === 'ArrowRight') { next = tabs[(index + 1) % tabs.length]; }
            else if (e.key === 'ArrowLeft') { next = tabs[(index - 1 + tabs.length) % tabs.length]; }
            else if (e.key === 'Home') { next = tabs[0]; }
            else if (e.key === 'End') { next = tabs[tabs.length - 1]; }
            if (next) { e.preventDefault(); next.click(); }
        });
    });
}());

// ── Foosball ball-tracking & statistics ──────────────────────────
(function () {
    var ROD_3 = 0, ROD_5 = 1, ROD_2 = 2;
    var GOALS_TO_WIN_SET   = 5;
    var SETS_TO_WIN_MATCH  = 3;
    var STORAGE_KEY        = 'foos-tracker-v1';

    // ── Game state ───────────────────────────────────────────────
    var eventHistory    = [];
    var goalsA          = [0, 0, 0, 0, 0]; // per-set goal counts (index 0 = set 1)
    var goalsB          = [0, 0, 0, 0, 0];
    var setsA           = 0;
    var setsB           = 0;
    var currentSet      = 1;
    var matchOver       = false;
    var currentHighlight = null; // currently highlighted grey cell element

    // ── Utility ──────────────────────────────────────────────────

    function rodFromAttr(str) {
        if (str === '3') return ROD_3;
        if (str === '5') return ROD_5;
        if (str === '2') return ROD_2;
        return null;
    }

    function rodToAttr(rod) {
        if (rod === ROD_3) return '3';
        if (rod === ROD_5) return '5';
        if (rod === ROD_2) return '2';
        return null;
    }

    // Reconstruct the DOM cell element from a plain-object event (used after localStorage restore).
    function findCell(e) {
        if (e.type === 'goal') {
            return document.querySelector('[data-cell-type="goal"][data-team="' + (e.teamA ? 'a' : 'b') + '"]');
        }
        var rodStr = rodToAttr(e.rod);
        if (!rodStr) return null;
        return document.querySelector(
            '[data-cell-type="' + e.type + '"][data-rod="' + rodStr + '"][data-team="' + (e.teamA ? 'a' : 'b') + '"]'
        );
    }

    // Return the last rod-or-grey event before any goal, or null.
    // A goal resets the chain (ball is back in play from a fresh placement).
    function lastMeaningful() {
        for (var i = eventHistory.length - 1; i >= 0; i--) {
            var e = eventHistory[i];
            if (e.type === 'goal') return null;
            if (e.type === 'rod' || e.type === 'grey') return e;
        }
        return null;
    }

    // ── Persistence ──────────────────────────────────────────────

    // Serialise all mutable state (without DOM references) to localStorage.
    function saveState() {
        try {
            var data = {
                events: eventHistory.map(function (e) {
                    return {
                        timestamp:    e.timestamp,
                        type:         e.type,
                        rod:          e.rod,
                        teamA:        e.teamA,
                        isTransition: e.isTransition,
                        set:          e.set,
                        auto:         e.auto
                    };
                }),
                goalsA:     goalsA,
                goalsB:     goalsB,
                setsA:      setsA,
                setsB:      setsB,
                currentSet: currentSet,
                matchOver:  matchOver
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (ex) { /* storage unavailable – silently ignore */ }
    }

    // Restore all mutable state from localStorage (called once on page load).
    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var data = JSON.parse(raw);
            goalsA     = data.goalsA     || [0, 0, 0, 0, 0];
            goalsB     = data.goalsB     || [0, 0, 0, 0, 0];
            setsA      = data.setsA      || 0;
            setsB      = data.setsB      || 0;
            currentSet = data.currentSet || 1;
            matchOver  = data.matchOver  || false;
            eventHistory = (data.events || []).map(function (e) {
                return {
                    timestamp:    e.timestamp,
                    type:         e.type,
                    rod:          e.rod,
                    teamA:        e.teamA,
                    isTransition: e.isTransition,
                    set:          e.set,
                    auto:         e.auto,
                    cellEl:       findCell(e)
                };
            });
        } catch (ex) {
            // Corrupted storage – reset silently so the page still loads.
            eventHistory = [];
            goalsA     = [0, 0, 0, 0, 0];
            goalsB     = [0, 0, 0, 0, 0];
            setsA      = 0;
            setsB      = 0;
            currentSet = 1;
            matchOver  = false;
        }
    }

    // ── Highlighting ─────────────────────────────────────────────
    // The yellow ring is always placed on the grey cell of the clicked row.
    // Rod and goal cells are never highlighted directly.

    function highlightCell(greyEl) {
        if (currentHighlight) currentHighlight.classList.remove('foos-cell-current');
        currentHighlight = greyEl || null;
        if (currentHighlight) currentHighlight.classList.add('foos-cell-current');
    }

    function greyForRow(rowId) {
        return document.querySelector('[data-row="' + rowId + '"][data-cell-type="grey"]');
    }

    function updateHighlight(cellEl) {
        var cellType = cellEl.getAttribute('data-cell-type');
        if (cellType === 'grey') {
            highlightCell(cellEl);
        } else if (cellType === 'rod') {
            highlightCell(greyForRow(cellEl.getAttribute('data-row')));
        } else {
            // goal: ball is no longer on a rod – remove the indicator
            highlightCell(null);
        }
    }

    // ── Scoreboard & tab visibility ──────────────────────────────

    function updateTabVisibility() {
        document.querySelectorAll('.foos-tab[data-tab]').forEach(function (tab) {
            var tabData = tab.getAttribute('data-tab');
            if (tabData === 'game') return; // Game tab is always visible
            var setNum = parseInt(tabData.replace('set', ''), 10);
            tab.style.display = (!isNaN(setNum) && setNum <= currentSet) ? '' : 'none';
        });
    }

    function updateScoreboard() {
        var elA = document.querySelector('[data-sb-sets][data-team="a"]');
        var elB = document.querySelector('[data-sb-sets][data-team="b"]');
        // Always show the count (including 0) so the scoreboard is non-empty from the start.
        if (elA) elA.textContent = setsA;
        if (elB) elB.textContent = setsB;

        for (var s = 1; s <= 5; s++) {
            var cA = document.querySelector('[data-sb-goals][data-set="' + s + '"][data-team="a"]');
            var cB = document.querySelector('[data-sb-goals][data-set="' + s + '"][data-team="b"]');
            // Only show sets that are finished or currently in progress; hide future sets.
            var show = (s <= currentSet);
            if (cA) { cA.style.visibility = show ? '' : 'hidden'; cA.textContent = show ? goalsA[s - 1] : ''; }
            if (cB) { cB.style.visibility = show ? '' : 'hidden'; cB.textContent = show ? goalsB[s - 1] : ''; }
        }

        updateTabVisibility();
    }

    // ── Grid enable/disable ──────────────────────────────────────

    function disableGrid() {
        document.querySelector('.foos-grid').classList.add('foos-grid-disabled');
    }

    function enableGrid() {
        document.querySelector('.foos-grid').classList.remove('foos-grid-disabled');
    }

    // ── Tab management ───────────────────────────────────────────

    function activateTab(tabEl, updateSet) {
        document.querySelectorAll('.foos-tab').forEach(function (t) {
            t.classList.remove('foos-tab-active');
            t.setAttribute('aria-selected', 'false');
            t.setAttribute('tabindex', '-1');
        });
        if (!tabEl) return;
        tabEl.classList.add('foos-tab-active');
        tabEl.setAttribute('aria-selected', 'true');
        tabEl.setAttribute('tabindex', '0');
        if (updateSet) {
            var tabData = tabEl.getAttribute('data-tab');
            if (tabData !== 'game') {
                var sn = parseInt(tabData.replace('set', ''), 10);
                if (!isNaN(sn)) currentSet = sn;
            }
        }
        updateStats();
    }

    // ── Set / match logic ────────────────────────────────────────

    function recomputeSets() {
        setsA = 0;
        setsB = 0;
        currentSet = 1;
        for (var s = 1; s <= 5; s++) {
            if (goalsA[s - 1] >= GOALS_TO_WIN_SET || goalsB[s - 1] >= GOALS_TO_WIN_SET) {
                if (goalsA[s - 1] >= GOALS_TO_WIN_SET) setsA++;
                else if (goalsB[s - 1] >= GOALS_TO_WIN_SET) setsB++;
                currentSet = s < 5 ? s + 1 : 5;
            }
        }
        matchOver = (setsA >= SETS_TO_WIN_MATCH || setsB >= SETS_TO_WIN_MATCH);
    }

    function handleGoal(isTeamA) {
        var setIdx = currentSet - 1;
        if (isTeamA) goalsA[setIdx]++;
        else goalsB[setIdx]++;

        updateScoreboard();

        // Check set win
        if (goalsA[setIdx] >= GOALS_TO_WIN_SET || goalsB[setIdx] >= GOALS_TO_WIN_SET) {
            if (goalsA[setIdx] >= GOALS_TO_WIN_SET) setsA++;
            else if (goalsB[setIdx] >= GOALS_TO_WIN_SET) setsB++;

            updateScoreboard();

            if (setsA >= SETS_TO_WIN_MATCH || setsB >= SETS_TO_WIN_MATCH) {
                matchOver = true;
                disableGrid();
            } else if (currentSet < 5) {
                currentSet++;
                var nextTab = document.querySelector('[data-tab="set' + currentSet + '"]');
                activateTab(nextTab, false);
            }
        }
    }

    // ── Event recording ──────────────────────────────────────────

    // auto=true marks events generated automatically by the engine (e.g. post-goal
    // ball placement) rather than by a direct user click.  Undo skips auto events
    // transparently so one press always undoes one logical action.
    function recordClick(cellEl, auto) {
        if (matchOver) return;

        var cellType = cellEl.getAttribute('data-cell-type');
        var rod      = rodFromAttr(cellEl.getAttribute('data-rod'));
        var teamA    = cellEl.getAttribute('data-team') === 'a';
        var lm       = lastMeaningful();

        // Transition: a rod click that follows any rod-or-grey event in this rally.
        // Grey clicks are always placements (isTransition = false) regardless.
        var isTransition = (cellType === 'rod') && (lm !== null);

        eventHistory.push({
            timestamp:    Date.now(),
            type:         cellType,
            rod:          rod,
            teamA:        teamA,
            isTransition: isTransition,
            set:          currentSet,
            cellEl:       cellEl,
            auto:         !!auto
        });

        updateHighlight(cellEl);

        if (cellType === 'goal') {
            handleGoal(teamA);
            // Auto-place ball on the opponent's 5-rod
            if (!matchOver) {
                var opp     = teamA ? 'b' : 'a';
                var oppGrey = document.querySelector('[data-cell-type="grey"][data-rod="5"][data-team="' + opp + '"]');
                if (oppGrey) recordClick(oppGrey, true);
            }
        }

        updateStats();
        saveState();
    }

    // ── Statistics ───────────────────────────────────────────────

    function computeStats(events) {
        var s = {
            poss3A:    0, poss3B:    0,
            poss5A:    0, poss5B:    0,
            poss2A:    0, poss2B:    0,
            scored3A:  0, scored3B:  0,
            scored5A:  0, scored5B:  0,
            scored2A:  0, scored2B:  0,
            fiveTo3A:  0, fiveTo3B:  0,
            twoTo3A:   0, twoTo3B:   0,
            block5A:   0, block5B:   0,
            steal5A:   0, steal5B:   0,
            counter5A: 0, counter5B: 0,
            block2A:   0, block2B:   0,
            steal2A:   0, steal2B:   0,
            saves3A:   0, saves3B:   0,
            foeteliA:  0, foeteliB:  0
        };

        // Include rod, grey (with team), and goal events; drop teamless items.
        var m = events.filter(function (e) {
            return e.type === 'rod' || e.type === 'grey' || e.type === 'goal';
        });

        for (var i = 0; i < m.length; i++) {
            var e = m[i];

            // Possession: both coloured rod clicks and grey placement clicks count.
            if (e.type === 'rod' || e.type === 'grey') {
                if (e.teamA) {
                    if (e.rod === ROD_3) s.poss3A++;
                    else if (e.rod === ROD_5) s.poss5A++;
                    else if (e.rod === ROD_2) s.poss2A++;
                } else {
                    if (e.rod === ROD_3) s.poss3B++;
                    else if (e.rod === ROD_5) s.poss5B++;
                    else if (e.rod === ROD_2) s.poss2B++;
                }
            }

            if (i + 1 < m.length) {
                var n = m[i + 1];
                var eBall = (e.type === 'rod' || e.type === 'grey');
                var nBall = (n.type === 'rod' || n.type === 'grey');

                // ── Same-team ball-to-ball transitions ──────────────
                if (eBall && nBall && e.teamA === n.teamA) {
                    // 5 to 3 pass (same team)
                    if (e.rod === ROD_5 && n.rod === ROD_3) {
                        if (e.teamA) s.fiveTo3A++; else s.fiveTo3B++;
                    }
                    // 2 to 3 pass (same team)
                    if (e.rod === ROD_2 && n.rod === ROD_3) {
                        if (e.teamA) s.twoTo3A++; else s.twoTo3B++;
                    }
                    // 5-rod block: 5 → 5 same team
                    if (e.rod === ROD_5 && n.rod === ROD_5) {
                        if (e.teamA) s.block5A++; else s.block5B++;
                    }
                    // 2-rod block: 2 → 2 same team
                    if (e.rod === ROD_2 && n.rod === ROD_2) {
                        if (e.teamA) s.block2A++; else s.block2B++;
                    }
                }

                // ── Cross-team ball-to-ball transitions ─────────────
                if (eBall && nBall && e.teamA !== n.teamA) {
                    // 5-rod steal: 5 → opponent 5 (credit to new holder)
                    if (e.rod === ROD_5 && n.rod === ROD_5) {
                        if (n.teamA) s.steal5A++; else s.steal5B++;
                    }
                    // 5-rod counter: 5 → opponent 3 (credit to new holder)
                    if (e.rod === ROD_5 && n.rod === ROD_3) {
                        if (n.teamA) s.counter5A++; else s.counter5B++;
                    }
                    // 2-rod steal: 2 → opponent 3 (credit to new holder)
                    if (e.rod === ROD_2 && n.rod === ROD_3) {
                        if (n.teamA) s.steal2A++; else s.steal2B++;
                    }
                    // 3-rod saves: opponent 3 → own 2 (credit to new holder)
                    if (e.rod === ROD_3 && n.rod === ROD_2) {
                        if (n.teamA) s.saves3A++; else s.saves3B++;
                    }
                }

                // ── Rod scored: possession directly followed by same-team goal ──
                if (eBall && n.type === 'goal' && e.teamA === n.teamA) {
                    if (e.rod === ROD_3) { if (e.teamA) s.scored3A++; else s.scored3B++; }
                    else if (e.rod === ROD_5) { if (e.teamA) s.scored5A++; else s.scored5B++; }
                    else if (e.rod === ROD_2) { if (e.teamA) s.scored2A++; else s.scored2B++; }
                }

                // ── Föteli / own goal: 2-rod followed by opponent's goal ────────
                if (eBall && e.rod === ROD_2 && n.type === 'goal' && e.teamA !== n.teamA) {
                    if (e.teamA) s.foeteliA++; else s.foeteliB++;
                }
            }
        }
        return s;
    }

    // ── Percentage (donut chart) statistics ──────────────────────
    //
    // Returns immediate and "eventually" percentages (0–100) for:
    //   3-rod scored  – 3-rod possession directly followed by same-team goal
    //   5-to-3        – 5-rod possession directly followed by same-team 3-rod
    //   2-rod clear   – 2-rod possession directly followed by:
    //                     same-team 5-rod or 3-rod, opponent's 2-rod, OR any goal
    //
    // "Eventually" variants collapse consecutive same-rod same-team events
    // into a single possession before applying the same direct-follow test.

    function computePctStats(events) {
        var m = events.filter(function (e) {
            return e.type === 'rod' || e.type === 'grey' || e.type === 'goal';
        });

        function pct(n, d) { return d > 0 ? Math.round(n / d * 100) : 0; }

        function calcStats(seq) {
            var poss3A = 0, poss3B = 0;
            var poss5A = 0, poss5B = 0;
            var poss2A = 0, poss2B = 0;
            var scored3A = 0, scored3B = 0;
            var five3A = 0, five3B = 0;
            var clear2A = 0, clear2B = 0;

            for (var i = 0; i < seq.length; i++) {
                var e = seq[i];
                var eBall = (e.type === 'rod' || e.type === 'grey');

                if (eBall) {
                    if (e.teamA) {
                        if (e.rod === ROD_3) poss3A++;
                        else if (e.rod === ROD_5) poss5A++;
                        else if (e.rod === ROD_2) poss2A++;
                    } else {
                        if (e.rod === ROD_3) poss3B++;
                        else if (e.rod === ROD_5) poss5B++;
                        else if (e.rod === ROD_2) poss2B++;
                    }
                }

                if (i + 1 < seq.length) {
                    var n = seq[i + 1];
                    var nBall = (n.type === 'rod' || n.type === 'grey');

                    // 3-rod scored: 3-rod followed by same-team goal
                    if (eBall && e.rod === ROD_3 && n.type === 'goal' && e.teamA === n.teamA) {
                        if (e.teamA) scored3A++; else scored3B++;
                    }

                    // 5-to-3: 5-rod followed by same-team 3-rod
                    if (eBall && e.rod === ROD_5 && nBall && n.rod === ROD_3 && e.teamA === n.teamA) {
                        if (e.teamA) five3A++; else five3B++;
                    }

                    // 2-rod clear: 2-rod followed by same-team 5/3-rod, opponent 2-rod,
                    // or any goal (including Föteli)
                    if (eBall && e.rod === ROD_2) {
                        var isClear = (nBall && n.teamA === e.teamA && (n.rod === ROD_5 || n.rod === ROD_3)) ||
                                      (n.type === 'goal') ||
                                      (nBall && n.rod === ROD_2 && n.teamA !== e.teamA);
                        if (isClear) { if (e.teamA) clear2A++; else clear2B++; }
                    }
                }
            }

            return {
                scored3A: pct(scored3A, poss3A), scored3B: pct(scored3B, poss3B),
                five3A:   pct(five3A,   poss5A), five3B:   pct(five3B,   poss5B),
                clear2A:  pct(clear2A,  poss2A), clear2B:  pct(clear2B,  poss2B)
            };
        }

        // Compressed sequence: consecutive same-rod same-team ball events → 1
        var compressed = [];
        for (var j = 0; j < m.length; j++) {
            var ce = m[j];
            if (compressed.length > 0) {
                var prev = compressed[compressed.length - 1];
                var prevBall = (prev.type === 'rod' || prev.type === 'grey');
                var ceBall   = (ce.type   === 'rod' || ce.type   === 'grey');
                if (prevBall && ceBall && prev.rod === ce.rod && prev.teamA === ce.teamA) {
                    continue; // merge into previous
                }
            }
            compressed.push(ce);
        }

        var imm = calcStats(m);
        var ev  = calcStats(compressed);

        return {
            scored3A:   imm.scored3A, scored3AEv: ev.scored3A,
            scored3B:   imm.scored3B, scored3BEv: ev.scored3B,
            five3A:     imm.five3A,   five3AEv:   ev.five3A,
            five3B:     imm.five3B,   five3BEv:   ev.five3B,
            clear2A:    imm.clear2A,  clear2AEv:  ev.clear2A,
            clear2B:    imm.clear2B,  clear2BEv:  ev.clear2B
        };
    }

    // Map stat-pct keys and teams → (outer %, inner %) then write CSS vars.
    function updatePctCharts(ps) {
        var data = {
            '3-rod-scored': { a: [ps.scored3A, ps.scored3AEv], b: [ps.scored3B, ps.scored3BEv] },
            '5-to-3':       { a: [ps.five3A,   ps.five3AEv  ], b: [ps.five3B,   ps.five3BEv  ] },
            '2-rod-clear':  { a: [ps.clear2A,  ps.clear2AEv ], b: [ps.clear2B,  ps.clear2BEv ] }
        };
        document.querySelectorAll('[data-stat-pct]').forEach(function (cell) {
            var stat = cell.getAttribute('data-stat-pct');
            var team = cell.getAttribute('data-team');
            if (!stat || !team || !data[stat]) return;
            var vals = data[stat][team];
            if (!vals) return;
            var wrap = cell.querySelector('.foos-pie-wrap');
            if (!wrap) return;
            wrap.style.setProperty('--pct-outer', vals[0]);
            wrap.style.setProperty('--pct-inner', vals[1]);
        });
    }

    function setBar(barEl, vA, vB) {
        var total = vA + vB;
        barEl.querySelector('.foos-bar-a').style.flex = (total === 0 ? 1 : vA);
        barEl.querySelector('.foos-bar-b').style.flex = (total === 0 ? 1 : vB);
    }

    function updateStats() {
        var activeTab = document.querySelector('.foos-tab-active');
        var tabData   = activeTab ? activeTab.getAttribute('data-tab') : 'game';

        var filtered;
        if (tabData === 'game') {
            filtered = eventHistory;
        } else {
            var setNum = parseInt(tabData.replace('set', ''), 10);
            filtered = isNaN(setNum) ? [] : eventHistory.filter(function (e) { return e.set === setNum; });
        }

        var s   = computeStats(filtered);
        var map = {
            '3-rod-poss':    [s.poss3A,    s.poss3B],
            '5-rod-poss':    [s.poss5A,    s.poss5B],
            '2-rod-poss':    [s.poss2A,    s.poss2B],
            '3-rod-scored':  [s.scored3A,  s.scored3B],
            '5-rod-scored':  [s.scored5A,  s.scored5B],
            '2-rod-scored':  [s.scored2A,  s.scored2B],
            '5-to-3':        [s.fiveTo3A,  s.fiveTo3B],
            '2-to-3':        [s.twoTo3A,   s.twoTo3B],
            '5-rod-block':   [s.block5A,   s.block5B],
            '5-rod-steal':   [s.steal5A,   s.steal5B],
            '5-rod-counter': [s.counter5A, s.counter5B],
            '2-rod-block':   [s.block2A,   s.block2B],
            '2-rod-steal':   [s.steal2A,   s.steal2B],
            '3-rod-saves':   [s.saves3A,   s.saves3B],
            'foeteli':       [s.foeteliA,  s.foeteliB]
        };

        Object.keys(map).forEach(function (key) {
            var vA = map[key][0], vB = map[key][1];
            document.querySelectorAll('[data-stat="' + key + '"]').forEach(function (el) {
                if (el.classList.contains('foos-ana-val')) {
                    var team  = el.getAttribute('data-team');
                    var val   = team === 'a' ? vA : vB;
                    var other = team === 'a' ? vB : vA;
                    el.textContent  = val;
                    el.style.fontWeight = (val > other) ? 'bold' : '';
                } else if (el.classList.contains('foos-ana-bar')) {
                    setBar(el, vA, vB);
                }
            });
        });

        updatePctCharts(computePctStats(filtered));
    }

    // ── Event wiring ─────────────────────────────────────────────

    // Grid cell clicks
    document.querySelectorAll('.foos-clickable').forEach(function (cell) {
        cell.addEventListener('click', function () { recordClick(this); });
    });

    // Tab clicks
    document.querySelectorAll('.foos-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            activateTab(this, true);
            this.focus();
        });
    });

    // Undo
    document.querySelector('[aria-label="Undo"]').addEventListener('click', function () {
        if (eventHistory.length === 0) return;

        // If the top event is an auto-placement, remove it silently so the undo
        // targets the goal that caused it (one press = undo goal + placement).
        if (eventHistory[eventHistory.length - 1].auto) {
            eventHistory.pop();
            if (eventHistory.length === 0) {
                highlightCell(null);
                updateStats();
                saveState();
                return;
            }
        }

        var removed = eventHistory.pop();

        if (removed.type === 'goal') {
            var setIdx = removed.set - 1;
            if (removed.teamA) goalsA[setIdx] = Math.max(0, goalsA[setIdx] - 1);
            else               goalsB[setIdx] = Math.max(0, goalsB[setIdx] - 1);
            recomputeSets();
            if (!matchOver) enableGrid();
            updateScoreboard();
            // Switch tab back to the set that is now in progress
            var tabAfterUndo = document.querySelector('[data-tab="set' + currentSet + '"]');
            activateTab(tabAfterUndo, false);
        }

        var last = eventHistory.length > 0 ? eventHistory[eventHistory.length - 1] : null;
        if (last && last.cellEl) updateHighlight(last.cellEl);
        else                     highlightCell(null);

        updateStats();
        saveState();
    });

    // Reset
    document.querySelector('[aria-label="Reset"]').addEventListener('click', function () {
        if (!confirm('Reset all tracking data?')) return;
        eventHistory = [];
        goalsA       = [0, 0, 0, 0, 0];
        goalsB       = [0, 0, 0, 0, 0];
        setsA        = 0;
        setsB        = 0;
        currentSet   = 1;
        matchOver    = false;

        highlightCell(null);
        enableGrid();
        updateScoreboard();

        activateTab(document.querySelector('[data-tab="game"]'), false);
        updateStats();
        saveState();
    });

    // ── Initial render ───────────────────────────────────────────
    loadState();

    var lastEv = eventHistory.length > 0 ? eventHistory[eventHistory.length - 1] : null;
    if (lastEv && lastEv.cellEl) updateHighlight(lastEv.cellEl);
    if (matchOver) disableGrid();

    updateScoreboard();
    activateTab(document.querySelector('[data-tab="game"]'), false);
}());
