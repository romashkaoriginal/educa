import { useEffect } from 'react';

/** Перезагрузка данных раздела при нажатии «Обновить» в шапке админки */
export function useSectionRefresh(dataRefreshKey, callback) {
  useEffect(() => {
    if (dataRefreshKey === 0) return;
    callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataRefreshKey]);
}
