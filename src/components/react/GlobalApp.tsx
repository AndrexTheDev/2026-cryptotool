import { useEffect, useState } from 'react';
import CommandPalette, { PALETTE_EVENT } from './CommandPalette';
import DonationModal, { DONATE_EVENT } from './DonationModal';
import RpcPanel, { RPC_EVENT } from './RpcPanel';

type Modal = 'none' | 'palette' | 'donate' | 'rpc';

/**
 * Einmal pro Seite montierte, leichtgewichtige Island:
 * Cmd/Ctrl+K-Navigator, Spenden-Modal, Netzwerk-Panel.
 * (Keine schweren Krypto-Abhaengigkeiten - laedt auf jeder Route.)
 */
export default function GlobalApp() {
  const [modal, setModal] = useState<Modal>('none');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setModal((m) => (m === 'palette' ? 'none' : 'palette'));
      }
    };
    const onPal = () => setModal('palette');
    const onDon = () => setModal('donate');
    const onRpc = () => setModal('rpc');
    window.addEventListener('keydown', onKey);
    window.addEventListener(PALETTE_EVENT, onPal);
    window.addEventListener(DONATE_EVENT, onDon);
    window.addEventListener(RPC_EVENT, onRpc);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(PALETTE_EVENT, onPal);
      window.removeEventListener(DONATE_EVENT, onDon);
      window.removeEventListener(RPC_EVENT, onRpc);
    };
  }, []);

  const close = () => setModal('none');
  return (
    <>
      <CommandPalette open={modal === 'palette'} onClose={close} />
      <DonationModal open={modal === 'donate'} onClose={close} />
      <RpcPanel open={modal === 'rpc'} onClose={close} />
    </>
  );
}
