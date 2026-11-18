# ==============================================================================
# Program: craps_simulation.py
# Programmer: Ethan-da-Tech-Wizard
# Last Modified: November 18, 2026
# Purpose: Simulates a casino-standard Craps dice game engine in Python CLI.
#          Models discrete state transitions between the initial Come-Out
#          phase and subsequent Point rounds according to formal casino rules.
#          Evaluates instantaneous settlement on Naturals (7, 11) or Craps
#          (2, 3, 12), and tracks the Markovian state transitions until
#          hitting the established point or a terminal Seven-Out condition.
# ==============================================================================

import random

# Prompt the operator to initiate execution of the Come-Out roll phase.
# The Come-Out roll is the foundational state where table rules establish
# either immediate contract payout or point registration.
input("Press enter to roll the two dice.")

# Roll two independent, uniformly distributed 6-sided dice (discrete uniform U[1, 6]).
# In physical craps, two independent physical dice ensure binomial distribution
# of the sum with maximum probability density centered at sum = 7 (P = 6/36 = 16.67%).
die1 = random.randint(1, 6)
die2 = random.randint(1, 6)
die_sum = die1 + die2
total_rolls = 1

# Display telemetry for the opening Come-Out roll
print("You rolled a", die1, "and a", die2, "for a total of", die_sum)

# ------------------------------------------------------------------------------
# State Machine: Come-Out Roll Evaluation
# ------------------------------------------------------------------------------
# Outcomes are partitioned into three mutually exclusive branches:
# Branch A: Natural (7 or 11) -> Pass line bet wins immediately (P = 8/36 = 22.2%)
# Branch B: Craps (2, 3, or 12) -> Pass line bet loses immediately (P = 4/36 = 11.1%)
# Branch C: Point established (4, 5, 6, 8, 9, 10) -> Game enters Point Phase (P = 24/36 = 66.7%)
if die_sum == 7 or die_sum == 11:
    # A total of 7 or 11 on the initial roll settles as an immediate Natural victory.
    print("You are a winner in one roll of the dice!")
elif die_sum == 2 or die_sum == 3 or die_sum == 12:
    # A total of 2, 3, or 12 settles as an immediate Craps loss.
    print("You are a loser in one roll of the dice!")
else:
    # --------------------------------------------------------------------------
    # State Transition: Transitioning to the Point Phase
    # --------------------------------------------------------------------------
    # The current sum becomes the target attractor ('the point').
    # The table loop executes repeatedly until an absorbing state is reached:
    # 1. State 'Point Matched' (die_sum == point): Win
    # 2. State 'Seven-Out' (die_sum == 7): Loss
    point = die_sum
    print("Your point is", point)
    game_over = False

    # Execute the iteration loop across subsequent point rolls
    while not game_over:
        input("Press enter to roll the two dice.")
        
        # Sample independent rolls for each die
        die1 = random.randint(1, 6)
        die2 = random.randint(1, 6)
        die_sum = die1 + die2
        total_rolls += 1
        print("You rolled a", die1, "and a", die2, "for a total of", die_sum)

        # Check absorbing state criteria
        if die_sum == point:
            # Player hits point before rolling a 7: winning absorbing state reached
            print(f"You rolled your point! You win on roll number {total_rolls}.")
            game_over = True
        elif die_sum == 7:
            # Player rolls a 7 before hitting point: losing absorbing state ('Seven-Out') reached
            print(f"You rolled a 7! You lose on roll number {total_rolls}.")
            game_over = True
