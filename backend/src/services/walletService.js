// backend/src/services/walletService.js
const { ethers } = require('ethers');
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const SALT_BYTES = 16;
const IV_BYTES = 12;

class WalletService {
  static deriveKey(secret, salt) {
    return crypto.scryptSync(secret, salt, 32);
  }

  static encrypt(text, secret) {
    const salt = crypto.randomBytes(SALT_BYTES);
    const iv = crypto.randomBytes(IV_BYTES);
    const key = WalletService.deriveKey(secret, salt);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([salt, iv, tag, enc]).toString('base64');
  }

  static decrypt(payload, secret) {
    const buf = Buffer.from(payload, 'base64');
    const salt = buf.slice(0, SALT_BYTES);
    const iv = buf.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const tag = buf.slice(SALT_BYTES + IV_BYTES, SALT_BYTES + IV_BYTES + 16);
    const enc = buf.slice(SALT_BYTES + IV_BYTES + 16);
    const key = WalletService.deriveKey(secret, salt);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  }

  async createWallet(userId) {
    const wallet = ethers.Wallet.createRandom();
    const encrypted = WalletService.encrypt(wallet.privateKey, process.env.WALLET_SECRET || 'change-me');
    return { address: wallet.address, encryptedPrivateKey: encrypted };
  }

  async getPrivateKey(encrypted) {
    return WalletService.decrypt(encrypted, process.env.WALLET_SECRET || 'change-me');
  }

  async getWallet(encrypted, provider) {
    const pk = await this.getPrivateKey(encrypted);
    return new ethers.Wallet(pk, provider);
  }
}

module.exports = WalletService;
