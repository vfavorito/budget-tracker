let transactions = [];
let myChart;

fetch("/api/transaction")
    .then(response => {
        return response.json();
    })
    .then(data => {
        // save db data on global variable
        transactions = data;

        populateTotal();
        populateTable();
        populateChart();
    });

function populateTotal() {
    // reduce transaction amounts to a single total value
    let total = transactions.reduce((total, t) => {
        return total + parseInt(t.value);
    }, 0);

    let totalEl = document.querySelector("#total");
    totalEl.textContent = total;
}

function populateTable() {
    let tbody = document.querySelector("#tbody");
    tbody.innerHTML = "";

    transactions.forEach(transaction => {
        // create and populate a table row
        let tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${transaction.name}</td>
      <td>${transaction.value}</td>
    `;

        tbody.appendChild(tr);
    });
}

function populateChart() {
    // copy array and reverse it
    let reversed = transactions.slice().reverse();
    let sum = 0;

    // create date labels for chart
    let labels = reversed.map(t => {
        let date = new Date(t.date);
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    });

    // create incremental values for chart
    let data = reversed.map(t => {
        sum += parseInt(t.value);
        return sum;
    });

    // remove old chart if it exists
    if (myChart) {
        myChart.destroy();
    }

    let ctx = document.getElementById("myChart").getContext("2d");

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: "Total Over Time",
                fill: true,
                backgroundColor: "#6666ff",
                data
            }]
        }
    });
}

function sendTransaction(isAdding) {
    let nameEl = document.querySelector("#t-name");
    let amountEl = document.querySelector("#t-amount");
    let errorEl = document.querySelector(".form .error");

    // validate form
    if (nameEl.value === "" || amountEl.value === "") {
        errorEl.textContent = "Missing Information";
        return;
    }
    else {
        errorEl.textContent = "";
    }

    // create record
    let transaction = {
        name: nameEl.value,
        value: amountEl.value,
        date: new Date().toISOString()
    };

    // if subtracting funds, convert amount to negative number
    if (!isAdding) {
        transaction.value *= -1;
    }

    // add to beginning of current array of data
    transactions.unshift(transaction);

    // re-run logic to populate ui with new record
    populateChart();
    populateTable();
    populateTotal();

    // also send to server
    fetch("/api/transaction", {
        method: "POST",
        body: JSON.stringify(transaction),
        headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json"
        }
    })
        .then(response => {
            return response.json();
        })
        .then(data => {
            if (data.errors) {
                errorEl.textContent = "Missing Information";
            }
            else {
                // clear form
                nameEl.value = "";
                amountEl.value = "";
            }
        })
        .catch(err => {
            // fetch failed, so save in indexed db
            saveRecord(transaction);

            // clear form
            nameEl.value = "";
            amountEl.value = "";
        });
}
// This function is called when a post to the remote database fails(so if you do not have an internet connection)
const saveRecord = (transaction) => {
    // opens an IndexedDB to keep track of offline transactions
    const request = window.indexedDB.open("pending", 1);
    request.onupgradeneeded = event => {
        const db = event.target.result;
        db.createObjectStore("pending", { keyPath: "date" });
    };
    // if database opened successfully send it the transaction
    request.onsuccess = () => {
        const db = request.result;
        const transactiondb = db.transaction(["pending"], "readwrite");
        const bcStore = transactiondb.objectStore("pending");
        bcStore.add(transaction);
    };
};
// this function is called after we have sent all the data from our indexedDB to the remote DB
// it will clear out all the data that was stored in the Indexed DB then update the total,chart,and table
const clearData = () => {
    const request = window.indexedDB.open("pending", 1);
    request.onsuccess = () => {
        const db = request.result;
        const transactiondb = db.transaction(["pending"], "readwrite");
        const bcStore = transactiondb.objectStore("pending");
        bcStore.clear();
        populateChart();
        populateTable();
        populateTotal();
    };
};

// if there is an internet connection we will look at any data that is stored in the Indexed DB and send it via post requests to the remote DB.
const sendData = () => {
    const request = window.indexedDB.open("pending", 1);
    request.onsuccess = () => {
        const db = request.result;
        const transactiondb = db.transaction(["pending"], "readwrite");
        const bcStore = transactiondb.objectStore("pending");
        const cursorRequest = bcStore.openCursor();
        cursorRequest.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                fetch("/api/transaction", {
                    method: "POST",
                    body: JSON.stringify(cursor.value),
                    headers: {
                        Accept: "application/json, text/plain, */*",
                        "Content-Type": "application/json"
                    }
                })
                    .then(response => {
                        return response.json();
                    })
                cursor.continue();
            }
            else {
                clearData();
            };
        };
    }
};
// function triggered by an eventlistener on the window looking for an internet connection.
const updateDb = () => {
    if (navigator.onLine) {
        sendData();
    }
    else {
        return;
    };
};
// event listener for internet connection
window.addEventListener("online", function () {
    updateDb();
});

// updateDb();

document.querySelector("#add-btn").onclick = function () {
    sendTransaction(true);
};

document.querySelector("#sub-btn").onclick = function () {
    sendTransaction(false);
};
