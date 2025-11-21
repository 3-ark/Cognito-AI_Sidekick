import { visit } from 'unist-util-visit';

const citationRegex = /\[(\d+)\]/g;

export function remarkCitation() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (typeof node.value !== 'string') {
        return;
      }

      const newNodes = [];
      let lastIndex = 0;
      let match;

      while ((match = citationRegex.exec(node.value)) !== null) {
        const textBefore = node.value.slice(lastIndex, match.index);
        if (textBefore) {
          newNodes.push({ type: 'text', value: textBefore });
        }

        newNodes.push({
          type: 'citation',
          value: match[1],
          children: [{ type: 'text', value: `[${match[1]}]` }],
        });

        lastIndex = match.index + match[0].length;
      }

      const textAfter = node.value.slice(lastIndex);
      if (textAfter) {
        newNodes.push({ type: 'text', value: textAfter });
      }

      if (newNodes.length > 0 && parent && index !== undefined) {
        parent.children.splice(index, 1, ...newNodes);
        return [visit.SKIP, index + newNodes.length];
      }
    });
  };
}
