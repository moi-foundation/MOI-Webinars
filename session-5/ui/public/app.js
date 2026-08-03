const statusEl = document.getElementById("status");
const mintBtn = document.getElementById("mint-btn");
const transferBtn = document.getElementById("transfer-btn");
const recipientInput = document.getElementById("recipient");
const logPanel = document.getElementById("log-panel");
const logEl = document.getElementById("log");

function showLog(text, isError = false) {
    logPanel.classList.remove("hidden");
    logEl.textContent = text;
    logEl.className = isError ? "err" : "ok";
}

async function refreshStatus() {
    const res = await fetch("/api/status");
    const data = await res.json();

    if (!data.deployed) {
        statusEl.innerHTML = '<span class="muted">No NFT minted yet.</span>';
        transferBtn.disabled = true;
        return;
    }

    statusEl.innerHTML = `
        <span class="ok">Minted</span> · token #${data.token_id}
        · asset <code>${data.asset_id?.slice(0, 12)}…</code>
    `;
    transferBtn.disabled = false;
}

mintBtn.addEventListener("click", async () => {
    mintBtn.disabled = true;
    showLog("Minting…");

    try {
        const res = await fetch("/api/mint", { method: "POST" });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        showLog(data.output);
        await refreshStatus();
    } catch (err) {
        showLog(err.message, true);
    } finally {
        mintBtn.disabled = false;
    }
});

transferBtn.addEventListener("click", async () => {
    const recipient = recipientInput.value.trim();
    if (!recipient) {
        showLog("Enter a recipient address.", true);
        return;
    }

    transferBtn.disabled = true;
    showLog("Transferring…");

    try {
        const res = await fetch("/api/transfer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        showLog(data.output);
    } catch (err) {
        showLog(err.message, true);
    } finally {
        transferBtn.disabled = false;
    }
});

refreshStatus();
