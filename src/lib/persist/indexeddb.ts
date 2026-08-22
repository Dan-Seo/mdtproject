import {
  deserializeProject,
  serializeProject,
  type Project,
} from '@/domain/model/project'

const DATABASE_NAME = 'kijun'
const DATABASE_VERSION = 1
const STORE_NAME = 'project'
/** 保存する案件は常に一つ。案件一覧はまだ無い。 */
const RECORD_KEY = 'current'

/**
 * 断面一覧はセルを打つたびに Project を差し替えるので、1打鍵1書き込みだと
 * 入力中ずっと IndexedDB を叩く。打ち終わってから書く。
 */
export const AUTOSAVE_DEBOUNCE_MS = 500

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB open blocked'))
  })
}

function run<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode)
        const request = operation(transaction.objectStore(STORE_NAME))

        transaction.oncomplete = () => {
          database.close()
          resolve(request.result)
        }
        transaction.onerror = () => {
          database.close()
          reject(transaction.error)
        }
        transaction.onabort = () => {
          database.close()
          reject(transaction.error)
        }
      }),
  )
}

export async function saveProject(project: Project): Promise<void> {
  await run('readwrite', (store) =>
    store.put(serializeProject(project), RECORD_KEY),
  )
}

/**
 * 復元できないものは黙って捨てて null を返す — 起動経路なので、ここで投げると
 * 消す手立てのないまま画面が白くなる。旧 schemaVersion も壊れた文字列も同じ
 * 扱いだ: どちらも「この記録では起動できない」以上のことを利用者に言えない。
 */
export async function loadStoredProject(): Promise<Project | null> {
  try {
    const stored = await run<string | undefined>('readonly', (store) =>
      store.get(RECORD_KEY),
    )
    if (typeof stored !== 'string') return null

    return deserializeProject(stored)
  } catch {
    return null
  }
}

export async function clearStoredProject(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(RECORD_KEY))
  } catch {
    // 消せないことを利用者に伝えても打つ手が無い。
  }
}

export interface Autosave {
  (project: Project): void
  /**
   * 待っている書き込みを今すぐ出す。頁を離れる時に呼ぶ — 打ち終わって
   * 500ms 以内に閉じられると、「前回の続き」を戻す機能が最後の一打を落とす。
   */
  flush(): void
}

export function createAutosave(
  write: (project: Project) => Promise<void> = saveProject,
): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Project | null = null

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }

    const target = pending
    pending = null
    if (target === null) return

    // 保存できないこと自体は作業を止める理由にならない — 計算はブラウザ内で
    // 完結している。タイマーの中なので、投げても誰も捕まえられない。
    void write(target).catch(() => {})
  }

  const autosave = (project: Project) => {
    pending = project
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS)
  }

  autosave.flush = flush
  return autosave
}
