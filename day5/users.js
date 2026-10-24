const USERS_URL = "https://jsonplaceholder.typicode.com/users";

const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

let users = [];

function renderUsers(list) {
    usersList.innerHTML = "";

    if (list.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.textContent = "No users match your filter.";
        usersList.appendChild(emptyItem);
        return;
    }

    list.forEach((user) => {
        const item = document.createElement("li");

        const name = document.createElement("strong");
        name.textContent = user.name;

        const details = document.createElement("p");
        details.textContent = `${user.email} · ${user.address.city} · ${user.company.name}`;

        item.appendChild(name);
        item.appendChild(details);
        usersList.appendChild(item);
    });
}

function filterUsers() {
    if (users.length === 0) return; // nothing loaded yet

    const searchText = filterInput.value.trim().toLowerCase();
    const matches = users.filter((user) =>
        user.name.toLowerCase().includes(searchText)
    );
    renderUsers(matches);
}

async function loadUsers() {
    statusText.textContent = "Loading users...";
    loadButton.disabled = true;

    try {
        const response = await fetch(USERS_URL);
        if (!response.ok) throw new Error(`Status ${response.status}`);

        users = await response.json();
        filterUsers();
        statusText.textContent = `Loaded ${users.length} users.`;
    } catch (error) {
        statusText.textContent = "Could not load users. Please try again.";
        console.error(error);
    } finally {
        loadButton.disabled = false; // runs whether it worked or failed
    }
}

loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", filterUsers);
