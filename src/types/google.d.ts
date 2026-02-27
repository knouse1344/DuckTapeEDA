declare const google: {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }): void;
      renderButton(
        element: HTMLElement,
        options: {
          theme?: "outline" | "filled_blue" | "filled_black";
          size?: "large" | "medium" | "small";
          type?: "standard" | "icon";
          text?: "signin_with" | "signup_with" | "continue_with" | "signin";
          width?: number;
        }
      ): void;
      prompt(): void;
      revoke(hint: string, callback?: () => void): void;
    };
  };
};
