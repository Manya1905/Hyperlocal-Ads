declare module 'shaka-player' {
  namespace shaka {
    class Player {
      constructor(video?: HTMLMediaElement);
      attach(video: HTMLMediaElement): Promise<void>;
      load(manifestUri: string): Promise<void>;
      pause(): void;
    }
    const polyfill: { installAll(): void };
  }
  const shaka: typeof shaka;
  export default shaka;
}