(function () {
    var STORAGE_KEY = 'theme';
    var DARK = 'dark';
    var LIGHT = 'light';

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
    }

    function getStoredTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    function getActiveTheme() {
        return getStoredTheme() || getSystemTheme();
    }

    function updateIcon(theme) {
        var icon = document.getElementById('darkmode-icon');
        if (icon) {
            icon.className = theme === DARK ? 'fa-solid fa-sun fa-stack-1x fa-inverse' : 'fa-solid fa-moon fa-stack-1x fa-inverse';
        }
        var toggle = document.getElementById('darkmode-toggle');
        if (toggle) {
            toggle.setAttribute('aria-pressed', theme === DARK ? 'true' : 'false');
        }
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-bs-theme', theme);
        updateIcon(theme);
    }

    // Apply theme immediately to prevent flash of wrong theme
    document.documentElement.setAttribute('data-bs-theme', getActiveTheme());

    document.addEventListener('DOMContentLoaded', function () {
        updateIcon(getActiveTheme());

        var toggle = document.getElementById('darkmode-toggle');
        if (toggle) {
            toggle.addEventListener('click', function () {
                var current = document.documentElement.getAttribute('data-bs-theme');
                var next = current === DARK ? LIGHT : DARK;
                try {
                    localStorage.setItem(STORAGE_KEY, next);
                } catch (e) {
                    console.warn('darkmode: could not persist theme preference', e);
                }
                applyTheme(next);
            });
        }
    });

    // React to OS-level theme changes when no user preference is stored
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (!getStoredTheme()) {
            applyTheme(e.matches ? DARK : LIGHT);
        }
    });
}());
