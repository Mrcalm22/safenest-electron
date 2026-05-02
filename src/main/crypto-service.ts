import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { hash, verify } from '@node-rs/argon2'
import type { PasswordEntry, EncryptedPayload, StoredVault } from '../types'

const DATA_VERSION = '2'
const AES_KEY_SIZE = 32
const AES_IV_SIZE = 16

let masterKey: Buffer | null = null

export function getMasterKey(): Buffer | null {
  return masterKey
}

export function clearMasterKey(): void {
  if (masterKey) {
    masterKey.fill(0)
    masterKey = null
  }
}

export async function hashMasterPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4
  })
}

export async function verifyMasterPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await verify(hash, password)
  } catch {
    return false
  }
}

export function deriveEncryptionKey(password: string, salt: Uint8Array): Buffer {
  const { scryptSync } = require('crypto')
  return scryptSync(password, salt, AES_KEY_SIZE)
}

export function encryptData(data: PasswordEntry[], key: Buffer): EncryptedPayload {
  const iv = randomBytes(AES_IV_SIZE)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = JSON.stringify(data)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    iv: Array.from(iv),
    data: Array.from(Buffer.concat([encrypted, authTag]))
  }
}

export function decryptData(payload: EncryptedPayload, key: Buffer): PasswordEntry[] | null {
  try {
    const iv = Buffer.from(payload.iv)
    const data = Buffer.from(payload.data)
    const encrypted = data.slice(0, data.length - 16)
    const authTag = data.slice(data.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    return null
  }
}

export function encryptVault(passwords: PasswordEntry[], password: string): StoredVault {
  const salt = randomBytes(16)
  const key = deriveEncryptionKey(password, salt)
  const encrypted = encryptData(passwords, key)
  key.fill(0)
  return {
    version: DATA_VERSION,
    salt: Array.from(salt),
    data: encrypted
  }
}

export function decryptLegacyVault(stored: { version: string; salt: number[]; data: { iv: number[]; data: number[] } }, password: string): PasswordEntry[] | null {
  try {
    const { pbkdf2Sync } = require('crypto')
    const salt = Buffer.from(stored.salt)
    const iv = Buffer.from(stored.data.iv)
    const data = Buffer.from(stored.data.data)
    const key = pbkdf2Sync(password, salt, 600000, AES_KEY_SIZE, 'sha256')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    return null
  }
}

export function decryptVault(stored: StoredVault, password: string): PasswordEntry[] | null {
  const salt = new Uint8Array(stored.salt)
  const key = deriveEncryptionKey(password, salt)
  const result = decryptData(stored.data, key)
  key.fill(0)
  return result
}

export function generatePassword(length = 16, options?: { upper?: boolean; lower?: boolean; digits?: boolean; symbols?: boolean }): string {
  const opts = { upper: true, lower: true, digits: true, symbols: true, ...options }
  let chars = ''
  if (opts.lower) chars += 'abcdefghijklmnopqrstuvwxyz'
  if (opts.upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (opts.digits) chars += '0123456789'
  if (opts.symbols) chars += '!@#$%^&*-_+=~'
  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

  const bytes = randomBytes(length)
  let pwd = ''
  for (let i = 0; i < length; i++) {
    pwd += chars[bytes[i] % chars.length]
  }
  return pwd
}

export function generatePassphrase(wordCount = 6): string {
  const wordlist = [
    'apple', 'river', 'mountain', 'ocean', 'forest', 'thunder', 'eagle', 'diamond',
    'crystal', 'shadow', 'flame', 'winter', 'summer', 'spring', 'autumn', 'storm',
    'phoenix', 'dragon', 'wolf', 'tiger', 'falcon', 'bear', 'lion', 'hawk',
    'iron', 'steel', 'silver', 'gold', 'bronze', 'copper', 'jade', 'pearl',
    'star', 'moon', 'sun', 'comet', 'galaxy', 'nebula', 'quasar', 'orbit',
    'wind', 'rain', 'snow', 'fog', 'cloud', 'mist', 'frost', 'ice',
    'oak', 'pine', 'maple', 'birch', 'cedar', 'willow', 'elm', 'ash',
    'ruby', 'sapphire', 'emerald', 'topaz', 'amber', 'opal', 'coral', 'onyx',
    'blaze', 'spark', 'ember', 'flash', 'glow', 'beam', 'ray', 'shine',
    'quest', 'voyage', 'journey', 'path', 'trail', 'road', 'way', 'route'
  ]
  const bytes = randomBytes(wordCount * 2)
  const words: string[] = []
  for (let i = 0; i < wordCount; i++) {
    const idx = (bytes[i * 2] << 8 | bytes[i * 2 + 1]) % wordlist.length
    words.push(wordlist[idx])
  }
  return words.join('-')
}

export function estimatePasswordStrength(password: string): { score: number; label: string } {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  let label = '弱'
  if (score >= 4) label = '强'
  else if (score >= 3) label = '中'

  return { score, label }
}

// ===== Recovery Key =====
const RECOVERY_WORDLIST = [
  'able','acid','aged','also','area','army','away','baby','back','ball','band','bank','base','bath','bear','beat','been','beer','bell','belt','best','bird','blow','blue','boat','body','bomb','bond','bone','book','boom','born','boss','both','bowl','bulk','burn','bush','busy','call','calm','came','camp','card','care','case','cash','cast','cell','chat','chip','city','club','coal','coat','code','cold','come','cook','cool','copy','core','cost','crew','crop','dark','data','date','dawn','dead','deal','dear','debt','deep','deny','desk','dial','diet','disc','disk','dive','door','dose','draw','drop','drug','dual','duke','dust','duty','earn','ease','east','edge','edit','else','even','ever','evil','exit','face','fact','fail','fair','fall','farm','fast','fate','fear','feed','feel','feet','fell','felt','file','fill','film','find','fine','fire','firm','fish','flat','flow','food','foot','ford','form','fort','four','free','from','fuel','full','fund','gain','game','gate','gear','gene','gift','girl','give','glad','goal','goat','gold','golf','gone','good','gray','grew','grey','grow','gulf','hair','half','hall','hand','hang','hard','harm','hate','have','head','hear','heat','held','hell','help','here','hero','high','hill','hire','hold','hole','holy','home','hope','host','hour','huge','hung','hunt','hurt','idea','inch','into','iron','item','jack','jazz','join','jump','jury','just','keen','keep','kent','kept','kick','kill','kind','king','knee','knew','know','lack','lady','laid','lake','land','lane','last','late','lead','left','less','life','lift','like','line','link','list','live','load','loan','lock','long','look','lord','lose','loss','lost','love','luck','made','mail','main','make','male','many','mark','mass','mate','meal','mean','meat','meet','menu','mile','milk','mill','mind','mine','miss','mode','mood','moon','more','most','move','much','must','name','navy','near','neck','need','news','next','nice','nine','none','nose','note','okay','once','only','onto','open','oral','over','pace','pack','page','paid','pain','pair','palm','park','part','pass','past','path','peak','pick','pile','pink','pipe','plan','play','plot','plug','plus','poem','pool','poor','port','post','pour','pray','pull','pure','push','quit','race','rail','rain','rank','rare','rate','read','real','rear','rely','rent','rest','rice','rich','ride','ring','rise','risk','road','rock','role','roll','roof','room','root','rope','rose','rule','rush','ruth','safe','sake','sale','salt','same','sand','save','seat','seed','seek','seem','seen','self','sell','send','sent','ship','shoe','shop','shot','show','shut','sick','side','sign','silk','sing','sink','site','size','skin','slip','slow','snow','soft','soil','sold','sole','some','song','soon','sort','soul','soup','sour','span','spin','spit','spot','star','stay','stem','step','stop','such','suit','sure','surf','swim','tail','take','tale','talk','tall','tank','tape','task','team','tear','tell','tend','term','test','text','than','that','them','then','thin','this','thus','till','time','tiny','told','toll','tone','took','tool','tour','town','tree','trip','true','tube','tune','turn','twin','type','ugly','unit','upon','used','user','vary','vast','very','view','vote','wage','wait','wake','walk','wall','want','ward','warm','wash','wave','ways','weak','wear','week','well','went','were','west','what','when','whom','wide','wife','wild','will','wind','wine','wing','wire','wise','wish','with','wood','wool','word','work','yard','year','zero','zone'
]

export function generateRecoveryKey(): string {
  const bytes = randomBytes(12)
  const words: string[] = []
  for (let i = 0; i < 12; i++) {
    words.push(RECOVERY_WORDLIST[bytes[i]])
  }
  return words.join(' ')
}

export function hashRecoveryKey(key: string): string {
  const { createHash } = require('crypto')
  return createHash('sha256').update(key.toLowerCase().trim()).digest('hex')
}

function deriveKeyFromRecoveryKey(key: string): Buffer {
  const { scryptSync } = require('crypto')
  const salt = Buffer.from('safenest-recovery-v1')
  return scryptSync(key.toLowerCase().trim(), salt, AES_KEY_SIZE)
}

export function encryptWithRecoveryKey(data: string, recoveryKey: string): EncryptedPayload {
  const key = deriveKeyFromRecoveryKey(recoveryKey)
  const iv = randomBytes(AES_IV_SIZE)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  key.fill(0)
  return {
    iv: Array.from(iv),
    data: Array.from(Buffer.concat([encrypted, authTag]))
  }
}

export function decryptWithRecoveryKey(stored: EncryptedPayload, recoveryKey: string): string | null {
  try {
    const key = deriveKeyFromRecoveryKey(recoveryKey)
    const iv = Buffer.from(stored.iv)
    const data = Buffer.from(stored.data)
    const encrypted = data.slice(0, data.length - 16)
    const authTag = data.slice(data.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    const result = decrypted.toString('utf8')
    key.fill(0)
    return result
  } catch {
    return null
  }
}
