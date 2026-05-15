import * as bcrypt from 'bcrypt';

export const hashData = async (data: string) => {
  return bcrypt.hash(data, 10);
};

export const compareData = async (
  data: string,
  encrypted: string,
) => {
  return bcrypt.compare(data, encrypted);
};