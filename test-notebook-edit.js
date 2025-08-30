#!/usr/bin/env node
import { Config } from './packages/core/dist/config/config.js';
import { NotebookEditTool } from './packages/core/dist/tools/notebook-edit.js';
import path from 'path';

async function testNotebookEdit() {
  console.log('Testing NotebookEdit tool...\n');
  
  // Create a mock config
  const config = new Config({
    targetDir: process.cwd(),
    auth: { type: 'api_key', apiKey: 'test' },
    model: 'gemini-1.5-flash',
  });

  const tool = new NotebookEditTool(config);
  
  // Test 1: Replace cell content
  console.log('Test 1: Replace cell content');
  const params1 = {
    notebook_path: path.join(process.cwd(), 'test-notebook.ipynb'),
    cell_id: 'cell-2',
    new_source: '# Updated code\nimport matplotlib.pyplot as plt\n\n# Create a plot\nplt.figure(figsize=(10, 6))\nplt.plot([1, 2, 3, 4], [1, 4, 9, 16])\nplt.title("Test Plot")\nplt.show()',
    cell_type: 'code',
    edit_mode: 'replace'
  };
  
  try {
    const invocation = tool.build(params1);
    const result = await invocation.execute(new AbortController().signal);
    console.log('Result:', result.llmContent);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 2: Insert a new cell
  console.log('\nTest 2: Insert a new cell');
  const params2 = {
    notebook_path: path.join(process.cwd(), 'test-notebook.ipynb'),
    cell_id: 'cell-1',
    new_source: '## New Section\n\nThis is a newly inserted markdown cell.',
    cell_type: 'markdown',
    edit_mode: 'insert'
  };
  
  try {
    const invocation = tool.build(params2);
    const result = await invocation.execute(new AbortController().signal);
    console.log('Result:', result.llmContent);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 3: Delete a cell
  console.log('\nTest 3: Delete a cell');
  const params3 = {
    notebook_path: path.join(process.cwd(), 'test-notebook.ipynb'),
    cell_id: 'cell-3',
    new_source: '',
    edit_mode: 'delete'
  };
  
  try {
    const invocation = tool.build(params3);
    const result = await invocation.execute(new AbortController().signal);
    console.log('Result:', result.llmContent);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('\nAll tests completed!');
}

testNotebookEdit().catch(console.error);