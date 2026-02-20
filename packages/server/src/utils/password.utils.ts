import bcrypt from 'bcryptjs';

const BCRYPT_COST_FACTOR = 12;

export const hashPassword = (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
};

export const comparePassword = (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
