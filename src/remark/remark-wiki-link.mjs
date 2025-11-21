import { visit } from 'unist-util-visit';

export function remarkWikiLink() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (typeof node.value !== 'string') return;

      const regex = /\[\[(.*?)\]\]/g;
      let match;
      let lastIndex = 0;
      const newNodes = [];

      while ((match = regex.exec(node.value)) !== null) {
        const [fullMatch, linkText] = match;

        // Add text before the link
        if (match.index > lastIndex) {
          newNodes.push({ type: 'text', value: node.value.slice(lastIndex, match.index) });
        }

        // Add the link node
        newNodes.push({
          type: 'wikiLink',
          value: linkText,
          children: [{ type: 'text', value: linkText }],
        });

        lastIndex = regex.lastIndex;
      }

      if (newNodes.length > 0) {
        // Add remaining text after the last link
        if (lastIndex < node.value.length) {
            newNodes.push({ type: 'text', value: node.value.slice(lastIndex) });
        }
        parent.children.splice(index, 1, ...newNodes);
        return [visit.SKIP, index + newNodes.length];
      }
    });
  };
}
