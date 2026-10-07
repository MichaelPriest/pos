const patterns={
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
  '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn',
  'F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn',
  'P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn',
  'Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn',
  '/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
};

const allowed=/^[0-9A-Z. $/+%-]+$/;

export function normalizeCode39(value){
  const code=String(value||'').trim().toUpperCase();
  return allowed.test(code)?code:'';
}

export default function Barcode39({value,height=54}){
  const code=normalizeCode39(value);
  if(!code)return null;
  const encoded=`*${code}*`;
  const narrow=2,wide=5,gap=2,quiet=10;
  let x=quiet;
  const bars=[];
  for(const char of encoded){
    const pattern=patterns[char];
    for(let index=0;index<pattern.length;index++){
      const width=pattern[index]==='w'?wide:narrow;
      if(index%2===0)bars.push(<rect key={`${char}-${x}-${index}`} x={x} y="0" width={width} height={height}/>);
      x+=width;
    }
    x+=gap;
  }
  const width=x+quiet-gap;
  return <svg className="barcode39" role="img" aria-label={`Código de barras ${code}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">{bars}</svg>;
}
