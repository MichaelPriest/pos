-- Corrige herança de EXECUTE via PUBLIC nos helpers SECURITY DEFINER.
-- Authenticated continua usando os helpers internamente nas policies e RPCs.

revoke execute on function public.is_admin() from public,anon;
revoke execute on function public.has_system_role(text[]) from public,anon;

grant execute on function public.is_admin() to authenticated,service_role;
grant execute on function public.has_system_role(text[]) to authenticated,service_role;
