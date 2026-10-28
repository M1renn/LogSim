import { useEffect, useState } from 'react';
import type { Difficulty, GameMode, MetaInfo, PublicGameState } from '../shared/types';
import { api } from './api';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import SettingsModal from './components/SettingsModal';

export default function App() {
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [state, setState] = useState<PublicGameState | null>(null);
  const [saveInfo, setSaveInfo] = useState<{ exists: boolean; title: string | null }>({ exists: false, title: null });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(e.message));
    api.saveInfo().then(setSaveInfo).catch(() => undefined);
  }, []);

  const start = async (mode: GameMode, levelId: string | null, difficulty: Difficulty) => {
    try {
      const r = await api.newGame(mode, levelId, difficulty);
      setState(r.state);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const resume = async () => {
    try {
      const r = await api.continueGame();
      setState(r.state);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toMenu = () => {
    setState(null);
    api.saveInfo().then(setSaveInfo).catch(() => undefined);
  };

  if (!meta) {
    return <div className="boot">{error ? `Не удалось подключиться к серверу игры: ${error}` : 'Загрузка…'}</div>;
  }

  return (
    <>
      {state ? (
        <GameScreen
          meta={meta}
          state={state}
          setState={setState}
          onMenu={toMenu}
          onSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <StartScreen
          meta={meta}
          saveInfo={saveInfo}
          onStart={start}
          onContinue={resume}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
      {settingsOpen && <SettingsModal meta={meta} onClose={() => setSettingsOpen(false)} />}
      {error && (
        <div className="toast bad" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </>
  );
}
