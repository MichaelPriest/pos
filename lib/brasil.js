const digits = value => String(value || '').replace(/\D/g, '');

export const maskCep = value => digits(value).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
export const maskPhone = value => digits(value).slice(0, 11).replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{4})$/, '$1-$2');
export const maskDocument = value => {
  const number = digits(value).slice(0, 14);
  if (number.length > 11) return number.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, '$1.$2.$3/$4-$5');
  return number.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, '$1.$2.$3-$4');
};

export async function findAddress(cep) {
  const number = digits(cep);
  if (number.length !== 8) throw new Error('Informe um CEP válido.');
  const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${number}`);
  if (!response.ok) throw new Error('CEP não encontrado. Confira e tente novamente.');
  const data = await response.json();
  return { zip_code: maskCep(number), street: data.street || '', neighborhood: data.neighborhood || '', city: data.city || '', state: data.state || '' };
}
