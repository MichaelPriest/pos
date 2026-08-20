import { useLocation, useNavigate, useParams } from 'react-router-dom';
export function useRouter(){const navigate=useNavigate(),location=useLocation(),params=useParams(),search=Object.fromEntries(new URLSearchParams(location.search));return{query:{...search,...params},asPath:location.pathname+location.search,push:to=>navigate(to),replace:to=>navigate(to,{replace:true}),back:()=>navigate(-1)}}
