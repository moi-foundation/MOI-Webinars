import { VoyageProvider, Wallet } from 'js-moi-sdk'
import { claim, getAssetBalance, hasLockedForBeneficiary, lockup } from '../../logic/swap.js'

const SWAP_RATE = 0.9 // 1 TKA = 0.9 TKB (display only)
const DERIVATION_PATH = "m/44'/6174'/7020'/0/0" // Voyage faucet path

const $ = (id) => document.getElementById(id)

const els = {
  loginCard: $('login-card'),
  mnemonic: $('mnemonic'),
  btnConnect: $('btn-connect'),
  loginStatus: $('login-status'),
  walletBar: $('wallet-bar'),
  activeAddress: $('active-address'),
  btnDisconnect: $('btn-disconnect'),
  swapCard: $('swap-card'),
  sendAmount: $('send-amount'),
  receiveAmount: $('receive-amount'),
  sendSymbol: $('send-symbol'),
  receiveSymbol: $('receive-symbol'),
  btnFlip: $('btn-flip'),
  counterparty: $('counterparty'),
  balTka: $('bal-tka'),
  balTkb: $('bal-tkb'),
  btnLock: $('btn-lock'),
  btnClaim: $('btn-claim'),
  claimHint: $('claim-hint'),
  btnRefresh: $('btn-refresh'),
  status: $('status'),
}

const tkaId = import.meta.env.VITE_TKA_ASSET_ID ?? ''
const tkbId = import.meta.env.VITE_TKB_ASSET_ID ?? ''

let wallet = null
let address = ''
let sendToken = 'TKA' // which side of the pair we're sending

function setStatus(el, msg, kind = '') {
  el.textContent = msg
  el.className = `status${kind ? ` ${kind}` : ''}`
}

function sendAssetId() {
  return sendToken === 'TKA' ? tkaId : tkbId
}

function recvAssetId() {
  return sendToken === 'TKA' ? tkbId : tkaId
}

function recvSymbol() {
  return sendToken === 'TKA' ? 'TKB' : 'TKA'
}

function sendAmount() {
  const n = Number(els.sendAmount.value || '0')
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive send amount')
  return Math.round(n)
}

function receiveAmount() {
  // TKA→TKB applies the rate; TKB→TKA inverts it
  const n = sendAmount()
  return sendToken === 'TKA' ? Math.round(n * SWAP_RATE) : Math.round(n / SWAP_RATE)
}

function counterpartyAddress() {
  const value = els.counterparty.value.trim()
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('Counterparty must be a 32-byte hex address (0x + 64 hex chars)')
  }
  return value
}

function updateSwapDisplay() {
  els.sendSymbol.textContent = sendToken
  els.receiveSymbol.textContent = recvSymbol()
  try {
    els.receiveAmount.textContent = receiveAmount().toString()
  } catch {
    els.receiveAmount.textContent = '—'
  }
}

async function refreshBalances() {
  if (!tkaId || !tkbId) {
    setStatus(els.status, 'Set VITE_TKA_ASSET_ID and VITE_TKB_ASSET_ID in .env (run npm run setup)', 'error')
    return
  }
  const [tka, tkb] = await Promise.all([
    getAssetBalance(tkaId, address, wallet),
    getAssetBalance(tkbId, address, wallet),
  ])
  els.balTka.textContent = tka.toString()
  els.balTkb.textContent = tkb.toString()
}

let claimGateOk = false
let claimGateTimer = null

function setBusy(busy) {
  els.btnLock.disabled = busy
  els.btnClaim.disabled = busy || !claimGateOk
  els.btnRefresh.disabled = busy
  els.btnFlip.disabled = busy
}

function setClaimHint(text, kind = '') {
  els.claimHint.textContent = text
  els.claimHint.className = `hint claim-hint${kind ? ` ${kind}` : ''}`
}

// Real on-chain check via moi.Lockups — reads the counterparty's outstanding
// lockups directly from chain state, no self-only restriction like BalanceOf.
async function updateClaimGate() {
  if (!wallet) return
  let benefactor
  let amount
  try {
    benefactor = counterpartyAddress()
    amount = receiveAmount()
  } catch {
    claimGateOk = false
    els.btnClaim.disabled = true
    setClaimHint('')
    return
  }
  try {
    claimGateOk = await hasLockedForBeneficiary(wallet.provider, benefactor, address, recvAssetId(), amount)
    els.btnClaim.disabled = !claimGateOk
    setClaimHint(
      claimGateOk
        ? `${amount} ${recvSymbol()} is locked for you on-chain — ready to claim.`
        : `Waiting for counterparty to lock ${amount} ${recvSymbol()}…`,
      claimGateOk ? 'ok' : '',
    )
  } catch {
    // Transient RPC hiccup during polling — keep last known state.
  }
}

function startClaimGatePolling() {
  stopClaimGatePolling()
  claimGateTimer = setInterval(updateClaimGate, 4000)
}

function stopClaimGatePolling() {
  if (claimGateTimer) clearInterval(claimGateTimer)
  claimGateTimer = null
}

async function onConnect() {
  const phrase = els.mnemonic.value.trim().replace(/\s+/g, ' ')
  if (phrase.split(' ').length < 12) {
    setStatus(els.loginStatus, 'A mnemonic is 12 words — check your phrase.', 'error')
    return
  }
  els.btnConnect.disabled = true
  try {
    setStatus(els.loginStatus, 'Deriving wallet from mnemonic…')
    const w = await Wallet.fromMnemonic(phrase, DERIVATION_PATH)
    w.connect(new VoyageProvider('devnet'))
    address = (await w.getIdentifier()).toHex()
    wallet = w

    els.loginCard.hidden = true
    els.walletBar.hidden = false
    els.swapCard.hidden = false
    els.activeAddress.textContent = address
    updateSwapDisplay()

    setStatus(els.status, 'Fetching balances from devnet…')
    await refreshBalances()
    setStatus(els.status, 'Ready — Lock your side for the counterparty, then Claim what they locked for you.')
    await updateClaimGate()
    startClaimGatePolling()
  } catch (err) {
    setStatus(els.loginStatus, err.message ?? String(err), 'error')
  } finally {
    els.btnConnect.disabled = false
  }
}

function onDisconnect() {
  stopClaimGatePolling()
  claimGateOk = false
  wallet = null
  address = ''
  els.mnemonic.value = ''
  els.counterparty.value = ''
  els.balTka.textContent = '—'
  els.balTkb.textContent = '—'
  els.btnClaim.disabled = true
  setClaimHint('')
  els.loginCard.hidden = false
  els.walletBar.hidden = true
  els.swapCard.hidden = true
  setStatus(els.loginStatus, 'Disconnected. Paste a mnemonic to connect another wallet.')
}

async function onLock() {
  setBusy(true)
  try {
    const beneficiary = counterpartyAddress()
    const amount = sendAmount()
    setStatus(els.status, `Locking ${amount} ${sendToken} for ${beneficiary.slice(0, 14)}…`)
    await lockup(sendAssetId(), wallet, beneficiary, amount)
    await refreshBalances()
    setStatus(els.status, `Locked ${amount} ${sendToken} for the counterparty — irrevocable, only they can claim it.`, 'ok')
    updateClaimGate()
  } catch (err) {
    setStatus(els.status, err.message ?? String(err), 'error')
  } finally {
    setBusy(false)
  }
}

async function onClaim() {
  setBusy(true)
  try {
    const benefactor = counterpartyAddress()
    const amount = receiveAmount()
    setStatus(els.status, `Claiming ${amount} ${recvSymbol()} from ${benefactor.slice(0, 14)}…`)
    await claim(recvAssetId(), wallet, benefactor, address, amount)
    await refreshBalances()
    setStatus(els.status, `Claimed ${amount} ${recvSymbol()} from the counterparty's lock.`, 'ok')
    updateClaimGate()
  } catch (err) {
    setStatus(els.status, err.message ?? String(err), 'error')
  } finally {
    setBusy(false)
  }
}

els.btnConnect.addEventListener('click', onConnect)
els.btnDisconnect.addEventListener('click', onDisconnect)
els.sendAmount.addEventListener('input', () => {
  updateSwapDisplay()
  updateClaimGate()
})
els.btnFlip.addEventListener('click', () => {
  sendToken = sendToken === 'TKA' ? 'TKB' : 'TKA'
  updateSwapDisplay()
  updateClaimGate()
})
els.counterparty.addEventListener('input', updateClaimGate)
els.btnLock.addEventListener('click', onLock)
els.btnClaim.addEventListener('click', onClaim)
els.btnRefresh.addEventListener('click', async () => {
  setBusy(true)
  try {
    await refreshBalances()
    await updateClaimGate()
    setStatus(els.status, 'Balances refreshed.', 'ok')
  } catch (err) {
    setStatus(els.status, err.message ?? String(err), 'error')
  } finally {
    setBusy(false)
  }
})
