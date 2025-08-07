import fs from 'fs'

// ✅ Thay đổi chuỗi hex này thành private key của bạn
const hexPrivateKey = 'DQGzMDZMrSrNWazwN5kTg7JKCpR3i1eyC7uKeKtJVgfUEUxLB7QQeuiA1mHw7bvXnGqZ2eLBuagZX1cJXKW6Cpv' // ví dụ: 5a33...8c

// 👉 Chuyển hex sang Uint8Array
const keyBytes = new Uint8Array(hexPrivateKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))

if (keyBytes.length !== 64) {
  console.error(`❌ Private key phải có 64 bytes (128 ký tự hex), hiện có ${keyBytes.length} bytes.`)
  process.exit(1)
}

// 👉 Lưu thành file JSON để dùng cho Solana CLI
fs.writeFileSync('phantom.json', JSON.stringify(Array.from(keyBytes)))
console.log('✅ Đã lưu file phantom.json để dùng với Solana CLI')
