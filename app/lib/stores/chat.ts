import { map } from 'nanostores';

export const chatStore = map({
  started: false,
  aborted: false,
  showChat: true,
  showMenu: false,
});

export function toggleMenu() {
  chatStore.setKey('showMenu', !chatStore.get().showMenu);
}
