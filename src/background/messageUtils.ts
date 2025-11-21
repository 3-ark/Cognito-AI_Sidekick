import { toPng } from 'html-to-image';

import { MessageTurn } from '../types/chatTypes';
import { Config } from '../types/config';

import storage from './storageUtil';

const getTimestamp = () => {
  return new Date().toJSON().slice(0, 19).replace('T', '_').replace(/:/g, '-');
};

const getPersonaNames = async () => {
  let assistantPersonaName = 'assistant';
  let userNameToDisplay = 'user';

  try {
    const storedConfigString = await storage.getItem('config');

    if (storedConfigString) {
      const config: Config = JSON.parse(storedConfigString);

      if (config.persona && typeof config.persona === 'string' && config.persona.trim() !== '') {
        assistantPersonaName = config.persona;
      }

      if (config.userName && typeof config.userName === 'string' && config.userName.trim() !== '') {
        userNameToDisplay = config.userName;
      }
    }
  } catch (error) {
    console.error('Failed to load config to get persona name for download:', error);
  }

  return { assistantPersonaName, userNameToDisplay };
}

export const downloadText = async (turns: MessageTurn[]) => {
  if (!turns || turns.length === 0) return;

  const { assistantPersonaName, userNameToDisplay } = await getPersonaNames();

  const text = turns.map(turn => {
    const roleName = turn.role === 'assistant' ? assistantPersonaName : (turn.role === 'user' ? userNameToDisplay : turn.role);
    let turnText = `${roleName}:\n`;

    if (turn.role === 'assistant' && turn.webDisplayContent) {
        turnText += `~From the Internet~\n${turn.webDisplayContent}\n\n---\n\n`;
    }

    turnText += turn.content;

    return turnText;
}).join('\n\n');
  const element = document.createElement('a');

  element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`);
  const filename = `chat_${getTimestamp()}.txt`;

  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
};

export const downloadJson = async (turns: MessageTurn[]) => {
  if (!turns || turns.length === 0) return;

  const { assistantPersonaName, userNameToDisplay } = await getPersonaNames();

  const transformedTurns = turns.map(turn => ({
    ...turn,
    role: turn.role === 'assistant' ? assistantPersonaName : (turn.role === 'user' ? userNameToDisplay : turn.role),
  }));

  const exportData = {
    assistantNameInExport: assistantPersonaName,
    userNameInExport: userNameToDisplay,
    chatHistory: transformedTurns,
  };
  const text = JSON.stringify(exportData, null, 2);

  const element = document.createElement('a');

  element.setAttribute('href', `data:application/json;charset=utf-8,${encodeURIComponent(text)}`);
  const filename = `chat_${getTimestamp()}.json`;

  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
};

export const downloadImage = (turns: MessageTurn[]) => {
  if (!turns || turns.length === 0) return;

  const nodes = document.querySelectorAll<HTMLElement>('.chatMessage');

  if (!nodes || nodes.length === 0) {
    console.warn('No chat messages found to generate image.');

    return;
  }

  const wrapper = document.createElement('div');

  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.paddingBottom = '1rem';
  wrapper.style.background = document.documentElement.style.getPropertyValue('--bg');

  if (nodes[0]) {
      const widthMultiplier = 1.2; // Adjust this value to control width ratio

      wrapper.style.width = `${nodes[0].offsetWidth * widthMultiplier}px`;
  }

  nodes.forEach(n => {
    const cloned = n.cloneNode(true);

    if (cloned instanceof HTMLElement) {
      cloned.style.marginTop = '1rem';
      cloned.style.boxSizing = 'border-box';
      wrapper.appendChild(cloned);
    } else {
      console.warn('Cloned node is not an HTMLElement:', cloned);
    }
  });

  function filter(node: Node): boolean {
    if (node instanceof Element) {
      const ariaLabel = node.getAttribute('aria-label');

      if (ariaLabel) {
        const labelsToExclude = [
          "Copy code",
          "Copied!",
          "Save edit",
          "Cancel edit",
        ];

        if (labelsToExclude.includes(ariaLabel)) {
          return false;
        }
      }
    }

    return true;
  }

  document.body.appendChild(wrapper);

  toPng(wrapper, {
    filter,
    pixelRatio: 2,
    style: {
        margin: '0',
        padding: wrapper.style.paddingBottom,
    },
    backgroundColor: document.documentElement.style.getPropertyValue('--bg') || '#ffffff',
  })
    .then(dataUrl => {
      const element = document.createElement('a');

      element.setAttribute('href', dataUrl);
      const filename = `chat_${getTimestamp()}.png`;

      element.setAttribute('download', filename);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    })
    .catch(error => {
      console.error('Oops, something went wrong generating the image!', error);
    })
    .finally(() => {
      if (document.body.contains(wrapper)) {
        document.body.removeChild(wrapper);
      }
    });
}

export const downloadMarkdown = async (turns: MessageTurn[]) => {
  if (!turns || turns.length === 0) return;

  const { assistantPersonaName, userNameToDisplay } = await getPersonaNames();

  const mdContent = turns.map(turn => {
    const roleName = turn.role === 'assistant' ? assistantPersonaName : (turn.role === 'user' ? userNameToDisplay : turn.role);
    const prefix = `### ${roleName}`;

    let content = turn.content;
    
    // keep code blocks
    content = content.replace(/```([\s\S]*?)```/g, '\n```$1```\n');
    
    // URLs to links
    content = content.replace(/(https?:\/\/[^\s]+)/g, '[Link]($1)');
    
    return `${prefix}\n\n${content}\n`;
  }).join('\n---\n\n');

  const element = document.createElement('a');

  element.setAttribute('href', `data:text/markdown;charset=utf-8,${encodeURIComponent(mdContent)}`);
  element.setAttribute('download', `chat_${getTimestamp()}.md`);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};
