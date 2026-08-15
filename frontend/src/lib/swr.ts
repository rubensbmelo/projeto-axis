import { useEffect, useState } from "react";
import { api } from "@/api/client";

const CACHE_PREFIX = "axis:swr:";

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // sessão cheia/indisponível — segue sem cache
  }
}

// Stale-while-revalidate: mostra o dado em cache imediatamente e refaz o
// fetch em segundo plano. "loading" só aparece quando NÃO há cache (1ª carga
// real). Isso evita o skeleton ao voltar de aba/janela, quando o navegador
// recarrega a página (tab discard) e o app sobe do zero.
export function useCachedFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(() => readCache<T>(url));
  const [loading, setLoading] = useState(() => !readCache<T>(url));
  const [error, setError] = useState<string | null>(null);

  const refetch = async () => {
    try {
      const fresh = await api.get<T>(url);
      writeCache(url, fresh);
      setData(fresh);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    let active = true;

    const cached = readCache<T>(url);
    if (cached) setData(cached); // mostra o cache na hora
    setLoading(!cached); // skeleton só se não há nada pra mostrar
    setError(null);

    api
      .get<T>(url)
      .then((fresh) => {
        writeCache(url, fresh);
        if (active) setData(fresh);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [url]);

  return { data, loading, error, refetch };
}
