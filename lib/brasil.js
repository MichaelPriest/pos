const digits = value => String(value || '').replace(/\D/g, '');

export const maskCep = value => digits(value).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
export const maskPhone = value => digits(value).slice(0, 11).replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{4})$/, '$1-$2');
export const maskDocument = value => {
  const number = digits(value).slice(0, 14);
  if (number.length > 11) return number.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, '$1.$2.$3/$4-$5');
  return number.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, '$1.$2.$3-$4');
};

const repeated = value => /^(\d)\1+$/.test(value);
const cpfDigit = (value, factor) => { let total=0;for(const digit of value.slice(0,factor-1))total+=Number(digit)*factor--;const result=(total*10)%11;return result===10?0:result; };
export const isValidCpf = value => { const number=digits(value);if(number.length!==11||repeated(number))return false;return cpfDigit(number,10)===Number(number[9])&&cpfDigit(number,11)===Number(number[10]); };
const cnpjDigit = value => { const weights=value.length===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];const sum=value.split('').reduce((total,digit,index)=>total+Number(digit)*weights[index],0),rest=sum%11;return rest<2?0:11-rest; };
export const isValidCnpj = value => { const number=digits(value);if(number.length!==14||repeated(number))return false;const first=cnpjDigit(number.slice(0,12));return first===Number(number[12])&&cnpjDigit(number.slice(0,12)+first)===Number(number[13]); };
export const isValidDocument = value => { const number=digits(value);return number.length===11?isValidCpf(number):number.length===14?isValidCnpj(number):false; };
export const isValidPhone = value => { const number=digits(value);return (number.length===10||number.length===11)&&!repeated(number); };

export async function findAddress(cep) {
  const number = digits(cep);
  if (number.length !== 8) throw new Error('Informe um CEP válido.');
  const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${number}`);
  if (!response.ok) throw new Error('CEP não encontrado. Confira e tente novamente.');
  const data = await response.json();
  return { zip_code: maskCep(number), street: data.street || '', neighborhood: data.neighborhood || '', city: data.city || '', state: data.state || '' };
}
