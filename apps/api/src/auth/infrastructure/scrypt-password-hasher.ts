import { Injectable } from '@nestjs/common';
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IPasswordHasher } from '../domain/password-hasher.interface';

function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

@Injectable()
export class ScryptPasswordHasher implements IPasswordHasher {
  private readonly keyLength = 64;
  private readonly cost = 16384;
  private readonly blockSize = 8;
  private readonly parallelization = 1;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(password, salt, this.keyLength, {
      N: this.cost,
      r: this.blockSize,
      p: this.parallelization,
    });

    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    try {
      const parts = storedHash.split('$');
      if (parts.length !== 3 || parts[0] !== 'scrypt') {
        return false;
      }

      const salt = parts[1];
      const key = Buffer.from(parts[2], 'hex');

      const derivedKey = await scryptAsync(password, salt, key.length, {
        N: this.cost,
        r: this.blockSize,
        p: this.parallelization,
      });

      if (key.length !== derivedKey.length) {
        return false;
      }

      return timingSafeEqual(key, derivedKey);
    } catch {
      return false;
    }
  }
}

