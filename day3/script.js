// 1. Starting notes array data
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// 2. Write searchNotes using filter, toLowerCase, and includes - returns an array of notes whose text contains word, ignoring upper and lower case.
function searchNotes(word) {
    return notes.filter(note => note.text.toLowerCase().includes(word.toLowerCase()));
}

// 3. Write longestNote - Handle the empty array first, then compare lengths.
function longestNote() {
    // Handle the empty array first
    if (notes.length === 0) {
        return null;
    }

    // Compare lengths to find the longest note
    let longest = notes[0];

    for (const note of notes) // Loop through each note
    {
        if (note.text.length > longest.text.length) {
            longest = note;
        }
    }
    return longest;
}

// 4.Write countByCategory by looping over the notes and increasing a counter in an object - returns an object with the counts of notes in each category.
function countByCategory() {
    const categoryCounts = {
        // Initialize counts for each category
        personal: 0,
        study: 0,
        work: 0,
    };

    for (const note of notes) {
        categoryCounts[note.category] ++; // Increase the count for the note's category
    };
    return categoryCounts;
}

// 5. Write getSummary using countByCategory and a template literal. Use "note" for exactly one note and "notes" otherwise.
function getSummary() {
    const counts = countByCategory();
    const totalNotes = notes.length;
    const noteWord = totalNotes === 1 ? "note" : "notes";
    
    return `You have ${totalNotes} ${noteWord}: ${counts.personal} personal, ${counts.study} study, and ${counts.work} work.`;
}

// 6. Write isDuplicate using some, comparing trimmed lower-case text
function isDuplicate(text) {
    const cleanedText = text.trim().toLowerCase();
    return notes.some(note => note.text.trim().toLowerCase() === cleanedText);
}

// 7. Write addNote, calling isDuplicate and checking length and category before adding.
function addNote(text, category) {
    //check text length
    if (text.length < 1 || text.length > 200) {
        console.log("❌ Note rejected: must be between 1 and 200 characters");
        return false;
    }

    //check duplicate
    if (isDuplicate(text)) {
        console.log("❌ Note rejected: duplicate note");
        return false;
    }

    //check category
    const validCategories = ["personal", "study", "work"];
    if (!validCategories.includes(category)) {
        console.log(`❌ Note rejected: category must be one of ${validCategories.join(", ")}`);
        return false;
    }

    // generate the next ID
    const nextId = notes.length + 1;

    //Add the note to the array
    notes.push({ 
        id: nextId, 
        text: text.trim(), 
        category 
    });

    console.log(`✅ Note added: ${text.trim()} (${category})`);
    return true;
}

// --- Test the functions ---

// searchNotes()
// Normal case
console.log(searchNotes("javascript"));

// Edge case: no matching notes
console.log(searchNotes("python"));

// longestNote()
// Normal case
console.log(longestNote());

// Edge case: empty array
const originalNotes = notes;
notes = [];
console.log(longestNote());
notes = originalNotes;


// countByCategory()
// Normal case
console.log(countByCategory());

// Edge case: empty array
notes = [];
console.log(countByCategory());
notes = originalNotes;


// getSummary()
// Normal case
console.log(getSummary());

// Edge case: exactly one note
notes = [
  { id: 1, text: "Test note", category: "personal" }
];

console.log(getSummary());

notes = originalNotes;


// isDuplicate()
// Normal case
console.log(isDuplicate("Call mum"));

// Edge case: different note
console.log(isDuplicate("Call dad"));

// Extra test: case and spaces should be ignored
console.log(isDuplicate("  BUY MILK AND BREAD  "));


// addNote()
// Normal case
console.log(addNote("Learn SQL joins", "study"));

// Edge case: duplicate note
console.log(addNote("  CALL MUM  ", "personal"));

// Edge case: invalid category
console.log(addNote("Go shopping", "shopping"));

// Edge case: empty text
console.log(addNote("", "personal"));

// Show final notes
console.log(notes);
