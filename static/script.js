var fileInput = document.getElementById("fileInput");
var preview = document.getElementById("previewContainer");
var results = document.getElementById("results");
var dropArea = document.getElementById("dropArea");

var realCount = 0;
var fakeCount = 0;
var filteredCount = 0;
var totalCount = 0;
var chart = null;

// LOGIN / DASHBOARD FLOW
// (Removed switchTab, launch, and logout as login page is removed)

function updateClock() {
    var clock = document.getElementById("clock");
    if (!clock) return;

    var now = new Date();
    clock.textContent = now.toLocaleString();
}

// SECTION SWITCHING
function showSection(sectionId, clickedItem) {
    document.getElementById("dashboardSection").classList.add("hidden-section");
    document.getElementById("newsSection").classList.add("hidden-section");

    document.querySelectorAll(".nav-item").forEach(function (item) {
        item.classList.remove("active");
    });

    document.getElementById(sectionId).classList.remove("hidden-section");

    if (clickedItem) {
        clickedItem.classList.add("active");
    } else {
        var fallback = document.querySelector('.nav-item[data-target="' + sectionId + '"]');
        if (fallback) fallback.classList.add("active");
    }
}

// MODAL
function toggleExtensionModal() {
    document.getElementById("extensionModal").classList.toggle("hidden-section");
}

// FILE INPUT
function openFile() {
    fileInput.click();
}

if (fileInput) {
    fileInput.addEventListener("change", function () {
        handleFiles(Array.from(fileInput.files || []));
    });
}

// DRAG AND DROP
if (dropArea) {
    ["dragenter", "dragover"].forEach(function (eventName) {
        dropArea.addEventListener(eventName, function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropArea.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach(function (eventName) {
        dropArea.addEventListener(eventName, function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropArea.classList.remove("dragover");
        });
    });

    dropArea.addEventListener("drop", function (e) {
        var files = Array.from(e.dataTransfer.files || []).filter(function (file) {
            return file.type.startsWith("image/");
        });
        handleFiles(files);
    });
}

function handleFiles(files) {
    if (!files.length) return;

    files.forEach(function (file) {
        uploadFile(file);
    });

    if (fileInput) {
        fileInput.value = "";
    }
}

function uploadFile(file) {
    var formData = new FormData();
    formData.append("file", file);

    addPreview(file);
    addFeedItem("info", "Queued for analysis", file.name);

    fetch("/upload", {
        method: "POST",
        body: formData
    })
    .then(function (res) {
        return res.json();
    })
    .then(function (data) {
        showResult(data, file.name);
    })
    .catch(function (err) {
        console.error(err);
        showResult({ label: "ERROR", confidence: 0 }, file.name);
    });
}

function addPreview(file) {
    var wrapper = document.createElement("div");
    wrapper.className = "preview-item";

    var img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = file.name;

    var caption = document.createElement("div");
    caption.className = "preview-caption";
    caption.textContent = file.name;

    wrapper.appendChild(img);
    wrapper.appendChild(caption);
    preview.appendChild(wrapper);
}

function normalizeLabel(label) {
    if (!label) return "error";

    var value = String(label).trim().toLowerCase();

    if (value === "real") return "real";
    if (value === "fake") return "fake";
    if (value === "filtered") return "filtered";
    return "error";
}

function showResult(data, fileName) {
    var normalized = normalizeLabel(data.label);
    var labelText = normalized === "error" ? "ERROR" : normalized.toUpperCase();
    var confidence = Number(data.confidence || 0);

    totalCount++;

    if (normalized === "real") realCount++;
    if (normalized === "fake") fakeCount++;
    if (normalized === "filtered") filteredCount++;

    updateStats();
    updateChart();

    var card = document.createElement("div");
    card.className = "result-box " + normalized;

    card.innerHTML =
        "<div class='result-top'>" +
            "<div class='badge " + normalized + "'>" + labelText + "</div>" +
            "<div class='result-confidence'>" + confidence + "%</div>" +
        "</div>" +
        "<div class='progress'>" +
            "<div class='progress-bar' style='width:" + confidence + "%'></div>" +
        "</div>" +
        "<div class='result-note'>" +
            "<strong>File:</strong> " + escapeHtml(fileName || "Uploaded image") +
        "</div>" +
        "<div class='result-note'>" +
            "Prediction returned from your current backend without changing the detection route." +
        "</div>";

    results.prepend(card);

    if (normalized === "error") {
        addFeedItem("info", "Analysis failed", fileName || "Uploaded image");
    } else {
        addFeedItem(normalized, "Analysis complete: " + labelText, fileName || "Uploaded image");
    }
}

function updateStats() {
    document.getElementById("realCount").innerText = realCount;
    document.getElementById("fakeCount").innerText = fakeCount;
    document.getElementById("filteredCount").innerText = filteredCount;
    document.getElementById("totalCount").innerText = totalCount;

    document.getElementById("realCountCard").innerText = realCount;
    document.getElementById("fakeCountCard").innerText = fakeCount;
    document.getElementById("filteredCountCard").innerText = filteredCount;
    document.getElementById("totalScansCard").innerText = totalCount;
}

function updateChart() {
    var data = {
        labels: ["Real", "Fake", "Filtered"],
        datasets: [{
            data: [realCount, fakeCount, filteredCount],
            backgroundColor: ["#00ff88", "#ff4d67", "#ffb300"],
            borderWidth: 0,
            borderRadius: 8
        }]
    };

    if (chart) {
        chart.data = data;
        chart.update();
        return;
    }

    chart = new Chart(document.getElementById("chart"), {
        type: "bar",
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: "rgba(255,255,255,0.06)"
                    },
                    ticks: {
                        color: "#8aa8c0"
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: "#8aa8c0"
                    }
                }
            }
        }
    });
}

function addFeedItem(type, title, meta) {
    var feed = document.getElementById("activityFeed");
    if (!feed) return;

    var empty = feed.querySelector(".feed-empty");
    if (empty) empty.remove();

    var item = document.createElement("div");
    item.className = "feed-item";

    item.innerHTML =
        "<div class='feed-dot " + type + "'></div>" +
        "<div class='feed-content'>" +
            "<div class='feed-title'>" + escapeHtml(title) + "</div>" +
            "<div class='feed-meta'>" + escapeHtml(meta || "") + "</div>" +
        "</div>";

    feed.prepend(item);
}

// NEWS
function verifyNewsAction() {
    var input = document.getElementById("newsTextInput");
    var btn = document.getElementById("verifyNewsBtn");
    var result = document.getElementById("newsResult");

    var text = input.value.trim();
    if (!text) {
        alert("Please enter some news text or a URL first.");
        return;
    }

    btn.innerText = "Verifying coverage...";
    btn.disabled = true;

    result.classList.remove("hidden-section");
    result.innerHTML = "<div class='section-sub'>Cross-referencing with trusted sources...</div>";

    fetch("/analyze-news", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: text })
    })
    .then(function (res) {
        return res.json();
    })
    .then(function (data) {
        btn.innerText = "Verify Authenticity";
        btn.disabled = false;

        if (data.success) {
            renderNewsResult(data.result);
        } else {
            result.innerHTML = "<div class='news-verdict-box red'><div class='news-verdict-title'>Verification Error</div><div class='news-verdict-sub'>" + escapeHtml(data.error || "Unknown error") + "</div></div>";
        }
    })
    .catch(function (err) {
        console.error(err);
        btn.innerText = "Verify Authenticity";
        btn.disabled = false;
        result.innerHTML = "<div class='news-verdict-box red'><div class='news-verdict-title'>Server Error</div><div class='news-verdict-sub'>Failed to connect to verification server.</div></div>";
    });
}

function renderNewsResult(result) {
    var newsResult = document.getElementById("newsResult");
    var verdict = result.verdict || {};
    var verdictColor = verdict.color || "orange";
    var verdictLabel = verdict.label || "Verification Complete";

    var publishers = (result.uniqueSources || []).slice(0, 8).join(", ");
    if (!publishers) {
        publishers = "No specific major publishers found";
    }

    var sources = result.sources || [];

    var links = sources.map(function (s) {
        var title = escapeHtml(s.title || "Untitled source");
        var url = s.url || "#";
        var sourceName = escapeHtml(s.source || s.domain || "Unknown source");
        var publishedAt = s.publishedAt ? " • " + escapeHtml(s.publishedAt) : "";

        return (
            "<div class='source-item'>" +
                "<a href='" + url + "' target='_blank' rel='noopener noreferrer'>" + title + "</a>" +
                "<div class='source-meta'>" + sourceName + publishedAt + "</div>" +
            "</div>"
        );
    }).join("");

    newsResult.classList.remove("hidden-section");
    newsResult.innerHTML =
        "<div class='news-verdict-box " + verdictColor + "'>" +
            "<div class='news-verdict-title'>" + escapeHtml(verdictLabel) + "</div>" +
            "<div class='news-verdict-sub'>" +
                (result.analyzedFromUrl ? "URL analyzed" : "Text analyzed") +
            "</div>" +
        "</div>" +

        "<div class='news-stats-grid'>" +
            "<div class='news-stat'>" +
                "<div class='news-stat-label'>Trusted Sources</div>" +
                "<div class='news-stat-value'>" + Number(result.uniqueSourceCount || 0) + "</div>" +
            "</div>" +
            "<div class='news-stat'>" +
                "<div class='news-stat-label'>Search Matches</div>" +
                "<div class='news-stat-value'>" + Number(result.totalMatches || 0) + "</div>" +
            "</div>" +
        "</div>" +

        "<div class='news-block'>" +
            "<div class='news-block-title'>Major Coverage</div>" +
            "<div class='news-coverage'>" + escapeHtml(publishers) + "</div>" +
        "</div>" +

        "<div class='news-block'>" +
            "<div class='news-block-title'>Verification Links</div>" +
            "<div class='sources-list'>" +
                (links || "<div class='section-sub'>No direct coverage links found.</div>") +
            "</div>" +
        "</div>";
}

function clearNews() {
    document.getElementById("newsTextInput").value = "";
    document.getElementById("newsResult").classList.add("hidden-section");
    document.getElementById("newsResult").innerHTML = "";
}

// HELPERS
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// GOOGLE AUTH
// (Auth logic removed as login page is removed)

// INIT
window.onload = function () {
    updateClock();
    setInterval(updateClock, 1000);
    updateChart();
};