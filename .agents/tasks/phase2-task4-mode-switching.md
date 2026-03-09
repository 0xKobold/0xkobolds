> **Agent:** Worker ⚒️
> **Task ID:** phase2-task4-mode-switching
> **Priority:** High
> **Depends on:** phase2-task3

# Task 4: Natural Mode Switching

## Objective
Implement seamless automatic mode switching without explicit `/mode` commands.

## Deliverables

1. **Update src/mode/natural-switcher.ts** (create if needed)
   ```typescript
   interface ModeSwitch {
     from: 'plan' | 'build';
     to: 'plan' | 'build';
     reason: string;
     suggested: boolean; // true = suggest, false = auto-switch
   }
   
   function maybeSwitchMode(
     currentMode: 'plan' | 'build',
     prompt: string
   ): ModeSwitch | null
   
   function executeSwitch(switch: ModeSwitch): void
   ```

2. **Update src/extensions/core/mode-manager-extension.ts**
   - Integrate with `/autonomous` toggle
   - Natural switching when autonomous mode is on

3. **Integration points**
   - Call detectModeFromPrompt() from task 3
   - Suggest or auto-switch based on confidence
   - Notify user of switch

## Flow
```
User prompt → detectModeFromPrompt()
                 ↓
   confidence > 80%? → Auto switch
   confidence 50-80%? → Suggest to user
   else → Stay current
```

## Done When
- [ ] natural-switcher.ts implemented
- [ ] Mode manager extension updated
- [ ] /autonomous toggle working
- [ ] Automatic switching works
- [ ] Tests pass

## Status
Write to: .agents/status/phase2-task4-done
