/** Mounted once (App.tsx): the scanner sheet, the asset quick view, the floating Scan button on phones, and the
 *  deep-link hand-off after sign-in. `ScanButton` is the top-bar action. */
import { useEffect } from 'react';
import { Icon } from '../shell/icons';
import { useAuth } from '../store/authStore';
import { Scanner } from './Scanner';
import { QuickView } from './QuickView';
import { consumeDeepLink, useScan } from './scanStore';
import '../styles/qr.css';

export function ScanButton() {
  const open = useScan(s => s.openScanner);
  return (
    <button type="button" className="btn qr-top" onClick={open} title="Scan an asset QR label" aria-label="Scan QR">
      <Icon name="qr" size={16} /><span>Scan QR</span>
    </button>
  );
}

export function ScanHost() {
  const user = useAuth(s => s.user);
  const scannerOpen = useScan(s => s.scannerOpen);
  const view = useScan(s => s.view);
  const open = useScan(s => s.openScanner);
  useEffect(() => { if (user) consumeDeepLink(); }, [user]);
  if (!user) return null;
  return (
    <>
      {!scannerOpen && !view && (
        <button type="button" className="qr-fab no-print" onClick={open} aria-label="Scan QR"><Icon name="qr" size={22} /></button>
      )}
      {scannerOpen && <Scanner />}
      {view && !scannerOpen && <QuickView />}
    </>
  );
}
