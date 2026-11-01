/** Request-derived browser permissions; the Host still authorizes every operation. */
export interface ConnectionAccess {
  /** Permission to manage persistent host settings through this connection. */
  settings: boolean
  /** Permission to open native dialogs and documents on the host desktop. */
  native: boolean
}

/** Connection-owned, noncacheable permission-discovery endpoint. */
export const ACCESS_PATH = '/api/access'
