const noteText = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearButton = document.querySelector("#clear-btn");
const themeToggle = document.querySelector("#theme-toggle");

const draftStorageKey = "quick-notes-draft";
const themeStorageKey = "quick-notes-theme";

function updateCounts() {
    const characterTotal = noteText.value.length;
    const words = noteText.value.trim().split(/\s+/).filter(Boolean);

    charCount.textContent = `${characterTotal} / 200 characters`;
    wordCount.textContent = `${words.length} ${words.length === 1 ? "word" : "words"}`;
    charCount.classList.toggle("warning", characterTotal > 180);
    charCount.classList.toggle("over", characterTotal > 200);
}

function clearNote() {
    noteText.value = "";
    localStorage.removeItem(draftStorageKey);
    updateCounts();
}

function updateThemeLabel() {
    themeToggle.textContent = document.body.classList.contains("dark")
        ? "Light mode"
        : "Dark mode";
}

noteText.addEventListener("input", () => {
    updateCounts();
    localStorage.setItem(draftStorageKey, noteText.value);
});

clearButton.addEventListener("click", clearNote);

noteText.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        clearNote();
    }
});

themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem(themeStorageKey, isDark ? "dark" : "light");
    updateThemeLabel();
});

const savedDraft = localStorage.getItem(draftStorageKey);
if (savedDraft !== null) {
    noteText.value = savedDraft;
}

if (localStorage.getItem(themeStorageKey) === "dark") {
    document.body.classList.add("dark");
}

updateThemeLabel();
updateCounts();
