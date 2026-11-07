import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { IonModal } from '@ionic/react';
import type { Transaction, TxType } from '@/shared/models';
import TransactionEditor from '@/features/transactions/TransactionEditor';

export interface EditorInit {
  type?: TxType;
  categoryId?: string;
  accountId?: string;
  toAccountId?: string;
  /** Pass an existing transaction to edit it. */
  tx?: Transaction;
  amount?: number;
  currency?: string;
  /** Full ISO time; kept when the user doesn't change the day. */
  date?: string;
  note?: string;
  /** Shown above the sheet, e.g. the bank text. */
  header?: ReactNode;
  /** Set when the editor opens from a bank text: saved on the transaction, offers all three types, runs the duplicate check. */
  smsFingerprint?: string;
  /** Called with the stored transaction (including its id) after a successful save. */
  onSaved?: (tx: Transaction) => void;
  /** The duplicate check's "Skip". */
  onSkipped?: () => void;
}

const TxEditorContext = createContext<(init?: EditorInit) => void>(() => {});

/** App-wide "add / edit transaction" sheet, so any screen can open it with one call. */
export function TxEditorProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [init, setInit] = useState<EditorInit>({});
  const [key, setKey] = useState(0);

  const open = useCallback((i: EditorInit = {}) => {
    setInit(i);
    setKey((k) => k + 1);
    setOpen(true);
  }, []);

  return (
    <TxEditorContext.Provider value={open}>
      {children}
      {/* Bottom sheet sized to its content; swipe down or tap outside to close. */}
      <IonModal
        className="b-editor-modal"
        isOpen={isOpen}
        breakpoints={[0, 1]}
        initialBreakpoint={1}
        handle={false}
        onDidDismiss={() => setOpen(false)}
      >
        {key > 0 && <TransactionEditor key={key} init={init} onClose={() => setOpen(false)} />}
      </IonModal>
    </TxEditorContext.Provider>
  );
}

export function useTxEditor() {
  return useContext(TxEditorContext);
}
