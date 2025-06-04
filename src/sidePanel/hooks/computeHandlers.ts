import { MessageTurn } from '../ChatHistory';
import type { Config, Model } from 'src/types/config';
import { processQueryWithAI } from '../network';

// Delay between sub-queries in MS for Medium/High compute
const SUB_QUERY_DELAY_MS = 1000;

export const handleHighCompute = async (
  message: string,
  history: MessageTurn[],
  config: Config,
  currentModel: Model,
  authHeader: Record<string, string> | undefined,
  onUpdate: (content: string, isFinished?: boolean) => void,
  abortSignal: AbortSignal
) => {
  const controlTemp = Math.max(0.1, (config.temperature || 0.7) * 0.5);

  const checkAborted = () => {
    if (abortSignal.aborted) {
      throw new Error("Operation cancelled by user");
    }
  };

  onUpdate("Decomposing task into stages...", false);
  checkAborted();
  await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS));

  const l1Prompt = `You are a planning agent. Given the original task: "${message}", break it down into the main sequential stages required to accomplish it. Output *only* a numbered list of stages. Example:\n1. First stage\n2. Second stage`;
  const l1DecompositionResult = await processQueryWithAI(l1Prompt, config, currentModel, authHeader, abortSignal, [], controlTemp);
  const stages = l1DecompositionResult.split('\n').map(s => s.trim()).filter(s => s.match(/^\d+\./));
  console.log("HighCompute - Raw L1 Decomposition Result:", l1DecompositionResult); // CONSOLE LOG ADDED
  onUpdate(`Monitoring: Generated Stages:\n${stages.join('\n') || '[None]'}`, false); // MONITORING ADDED

  checkAborted();
  if (!stages || stages.length === 0) {
    onUpdate("Error: Failed to decompose task into stages. Falling back to direct query.", true);
    return "Error: Could not decompose task.";
  }

  const stageResults: string[] = [];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    checkAborted();
    onUpdate(`Processing Stage ${i + 1}/${stages.length}: ${stage}...`, false);

    // Level 2 Decomposition (Steps)
    const l2Prompt = `You are a planning agent. Given the stage: "${stage}", break it down into the specific sequential steps needed to complete it. Output *only* a numbered list of steps. If no further breakdown is needed, output "No breakdown needed."`;
    checkAborted();
    await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS));
    const l2DecompositionResult = await processQueryWithAI(l2Prompt, config, currentModel, authHeader, abortSignal, [], controlTemp);
    console.log(`HighCompute - Raw L2 Decomposition Result (Stage ${i + 1}):`, l2DecompositionResult); // CONSOLE LOG ADDED
    const steps = l2DecompositionResult.split('\n').map(s => s.trim()).filter(s => s.match(/^\d+\./));
    onUpdate(`Monitoring: Generated Steps for Stage ${i + 1}:\n${steps.join('\n') || '[None, or direct solve]'}`, false); // MONITORING ADDED

    let currentStageResult = '';
    if (steps.length === 0 || l2DecompositionResult.includes("No breakdown needed")) {
      onUpdate(`Solving Stage ${i + 1} directly...`, false);
      checkAborted();
      const stageSolvePrompt = `Complete the following stage based on the original task "${message}": "${stage}"`;
      checkAborted();
      await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS));
      currentStageResult = await processQueryWithAI(stageSolvePrompt, config, currentModel, authHeader, abortSignal);
      console.log(`HighCompute - Raw Direct Solve Result (Stage ${i + 1}):`, currentStageResult); // CONSOLE LOG ADDED
      onUpdate(`Monitoring: Direct Solve Result for Stage ${i + 1}:\n${currentStageResult}`, false); // MONITORING ADDED
    } else {
      const stepResults: string[] = [];
      const batchSize = 2; // Adjust as needed
      let accumulatedContext = ""; // **CONTEXTUAL PROMPTING**

      for (let j = 0; j < steps.length; j += batchSize) {
        const batch = steps.slice(j, j + batchSize);
        const batchNumber = j / batchSize + 1;
        checkAborted();

        onUpdate(`Solving Step Batch ${batchNumber} for Stage ${i + 1}: ${batch.join(', ')}...`, false);

        // Construct the prompt for the batch, including accumulated context
        const batchPrompt = `You are an expert problem solver. Given the stage: "${stage}" and the original task: "${message}", complete the following steps.  Consider the following accumulated context from previous steps: ${accumulatedContext}\n\n${batch.map((step, index) => `${j + index + 1}. ${step}`).join('\n')}\n\nProvide your answer in the same numbered format as the steps.`;

        checkAborted();
        await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS));
        const batchResults = await processQueryWithAI(batchPrompt, config, currentModel, authHeader, abortSignal);
        console.log(`HighCompute - Raw Batch Results (Stage ${i + 1}, Batch ${batchNumber}):`, batchResults); // CONSOLE LOG ADDED
        onUpdate(`Monitoring: Raw Batch Results for Stage ${i + 1}, Batch ${batchNumber}:\n${batchResults}`, false); // MONITORING ADDED

        const parsedBatchResults = batchResults.split('\n').map(s => s.trim()).filter(s => s.match(/^\d+\./)).map(s => s.replace(/^\d+\.\s*/, ''));
        console.log(`HighCompute - Parsed Batch Results (Stage ${i + 1}, Batch ${batchNumber}):`, parsedBatchResults); // CONSOLE LOG ADDED
        onUpdate(`Monitoring: Parsed Batch Results for Stage ${i + 1}, Batch ${batchNumber}:\n${parsedBatchResults.join('\n') || '[None]'}`, false); // MONITORING ADDED

        for (let k = 0; k < parsedBatchResults.length; k++) {
          const stepResult = parsedBatchResults[k];
          stepResults.push(stepResult);
          accumulatedContext += `Step ${j + k + 1}: ${stepResult}\n`; // Update accumulated context
        }
      }

      // Synthesize Step Results into Stage Result (No Change Needed)
      onUpdate(`Synthesizing results for Stage ${i + 1}...`, false);
      checkAborted();
      await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS));
      const stageSynthPrompt = `Synthesize the results of the following steps for stage "${stage}" into a coherent paragraph:\n\n${stepResults.map((r, idx) => `Step ${idx + 1} Result:\n${r}`).join('\n\n')}`;
      currentStageResult = await processQueryWithAI(stageSynthPrompt, config, currentModel, authHeader, abortSignal, [], controlTemp);
      console.log(`HighCompute - Raw Stage Synthesis Result (Stage ${i + 1}):`, currentStageResult); // CONSOLE LOG ADDED
      onUpdate(`Monitoring: Synthesized Result for Stage ${i + 1}:\n${currentStageResult}`, false); // MONITORING ADDED
    }
    stageResults.push(currentStageResult);
    onUpdate(`Monitoring: Accumulated Stage Results so far:\n${stageResults.map((r, idx) => `Stage ${idx + 1}: ${r}`).join('\n---\n')}`, false); // MONITORING ADDED
  }


  // --- Option 1: Show Stages + Final Synthesis ---
  onUpdate("Synthesizing final answer...", false);
  checkAborted();
  // Modify the prompt to ask for a summary *based on* the stages, rather than just replacing them.
  const finalSynthPrompt = `Based on the results of the following stages, provide a final comprehensive answer for the original task "${message}":\n\n${stageResults.map((r, idx) => `Stage ${idx + 1} (${stages[idx]}):\n${r}`).join('\n\n')}`;
  onUpdate(`Monitoring: Final Synthesis Prompt:\n${finalSynthPrompt}`, false); // MONITORING ADDED
  console.log("HighCompute - Final Synthesis Prompt:", finalSynthPrompt); // CONSOLE LOG ADDED
  checkAborted();
  await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS)); // Delay
  const finalSynthesizedAnswer = await processQueryWithAI(finalSynthPrompt, config, currentModel, authHeader, abortSignal, [], controlTemp);
  console.log("HighCompute - Raw Final Synthesis Result:", finalSynthesizedAnswer); // CONSOLE LOG ADDED
  // Construct a detailed final output including stage summaries
  const detailedFinalOutput = `**High Compute Breakdown:**\n\n` +
                              stageResults.map((r, idx) => `**Stage ${idx + 1}: ${stages[idx]}**\n${r}`).join('\n\n---\n\n') +
                              `\n\n---\n**Final Synthesized Answer:**\n${finalSynthesizedAnswer}`;

  onUpdate(detailedFinalOutput, true); // Update with the detailed output
  return detailedFinalOutput; // Return the detailed output
};

export const handleMediumCompute = async (
  message: string,
  history: MessageTurn[],
  config: Config,
  currentModel: Model,
  authHeader: Record<string, string> | undefined,
  onUpdate: (content: string, isFinished?: boolean) => void,
  abortSignal: AbortSignal
) => {
  const controlTemp = Math.max(0.1, (config.temperature || 0.7) * 0.5);

  const checkAborted = () => {
    if (abortSignal.aborted) {
      throw new Error("Operation cancelled by user");
    }
  };

  onUpdate("Decomposing task into subtasks...", false);
  checkAborted();
  await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS));

  const decompPrompt = `You are a planning agent. Given the task: "${message}", break it down into logical subtasks needed to accomplish it. Output *only* a numbered list of subtasks.`;
  const decompositionResult = await processQueryWithAI(decompPrompt, config, currentModel, authHeader, abortSignal, [], controlTemp);
  const subtasks = decompositionResult.split('\n').map(s => s.trim()).filter(s => s.match(/^\d+\./));
  console.log("MediumCompute - Raw Decomposition Result:", decompositionResult); // CONSOLE LOG ADDED
  onUpdate(`Monitoring: Generated Subtasks:\n${subtasks.join('\n') || '[None]'}`, false); // MONITORING ADDED

  checkAborted();
  if (!subtasks || subtasks.length === 0) {
    onUpdate("Warning: Failed to decompose into subtasks. Attempting direct query.", false);
    checkAborted();
    await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS));
    const directResult = await processQueryWithAI(message, config, currentModel, authHeader, abortSignal);
    onUpdate(directResult, true);
    return directResult;
  }

  // **BATCH PROCESSING AND CONTEXTUAL PROMPTING**
  const batchSize = 2; // Adjust as needed based on token limits and performance
  const subtaskResults: string[] = [];

  for (let i = 0; i < subtasks.length; i += batchSize) {
    const batch = subtasks.slice(i, i + batchSize);
    const batchNumber = i / batchSize + 1; // For clearer logging and updates

    checkAborted();
    onUpdate(`Solving Subtask Batch ${batchNumber}: ${batch.join(', ')}...`, false);

    // Construct the prompt for the batch
    const batchPrompt = `You are an expert problem solver. Given the task: "${message}", complete the following subtasks:\n\n${batch.map((subtask, index) => `${i + index + 1}. ${subtask}`).join('\n')}\n\nProvide your answer in the same numbered format as the subtasks.`;

    checkAborted();
    await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS));
    const batchResults = await processQueryWithAI(batchPrompt, config, currentModel, authHeader, abortSignal);
    console.log(`MediumCompute - Raw Batch Results (Batch ${batchNumber}):`, batchResults); // CONSOLE LOG ADDED
    onUpdate(`Monitoring: Raw Batch Results for Batch ${batchNumber}:\n${batchResults}`, false); // MONITORING ADDED

    // Parse the batch results
    const parsedBatchResults = batchResults.split('\n').map(s => s.trim()).filter(s => s.match(/^\d+\./)).map(s => s.replace(/^\d+\.\s*/, '')); // Extract results, removing numbering
    console.log(`MediumCompute - Parsed Batch Results (Batch ${batchNumber}):`, parsedBatchResults); // CONSOLE LOG ADDED
    onUpdate(`Monitoring: Parsed Batch Results for Batch ${batchNumber}:\n${parsedBatchResults.join('\n') || '[None]'}`, false); // MONITORING ADDED

    // Add the results to the subtaskResults array
    for (let j = 0; j < parsedBatchResults.length; j++) {
      subtaskResults.push(parsedBatchResults[j]);
    }
  }

  // Final Synthesis (No Change Needed)
  onUpdate("Synthesizing final answer...", false);
  checkAborted();
  await new Promise(resolve => setTimeout(resolve, SUB_QUERY_DELAY_MS));
  const finalSynthPrompt = `Synthesize the results of the following subtasks into a final comprehensive answer for the original task "${message}":\n\n${subtaskResults.map((r, idx) => `Subtask ${idx + 1} Result:\n${r}`).join('\n\n')}`;
  console.log("MediumCompute - Final Synthesis Prompt:", finalSynthPrompt); // CONSOLE LOG ADDED
  onUpdate(`Monitoring: Final Synthesis Prompt:\n${finalSynthPrompt}`, false); // MONITORING ADDED
  const finalSynthesizedAnswer = await processQueryWithAI(finalSynthPrompt, config, currentModel, authHeader, abortSignal, [], controlTemp);
  console.log("MediumCompute - Raw Final Synthesis Result:", finalSynthesizedAnswer); // CONSOLE LOG ADDED

  const detailedFinalOutput = `**Medium Compute Breakdown:**\n\n` +
                              subtaskResults.map((r, idx) => `**Subtask ${idx + 1}: ${subtasks[idx]}**\n${r}`).join('\n\n---\n\n') +
                              `\n\n---\n**Final Synthesized Answer:**\n${finalSynthesizedAnswer}`;

  onUpdate(detailedFinalOutput, true);
  return detailedFinalOutput;
};
