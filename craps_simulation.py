# ==============================================================================
# Program: craps_simulation.py
# Programmer: Ethan-da-Tech-Wizard
# Last Modified: November 18, 2026
# Purpose: Simulates a classic casino craps dice game in the terminal.
#          Evaluates the initial come-out roll for immediate win/loss conditions
#          (natural 7/11 or craps 2/3/12). Establishes a point value for any
#          other initial roll, prompting the player to repeatedly roll until
#          either the point is matched (win) or a 7 is rolled (loss).
#          Tracks total rolls and prints descriptive status messages.
# ==============================================================================

import random

# Prompt the user to start the game by executing the initial 'come-out' roll
input("Press enter to roll the two dice.")

# Roll two six-sided dice independently (values 1 through 6)
die1 = random.randint(1, 6)
die2 = random.randint(1, 6)
die_sum = die1 + die2
total_rolls = 1

# Output the result of the first roll
print("You rolled a", die1, "and a", die2, "for a total of", die_sum)

# Evaluate initial roll outcome based on standard craps rules
if die_sum == 7 or die_sum == 11:
    # A total of 7 or 11 on the come-out roll is an immediate win (Natural)
    print("You are a winner in one roll of the dice!")
elif die_sum == 2 or die_sum == 3 or die_sum == 12:
    # A total of 2, 3, or 12 on the come-out roll is an immediate loss (Craps)
    print("You are a loser in one roll of the dice!")
else:
    # Any other sum (4, 5, 6, 8, 9, 10) establishes 'the point'
    point = die_sum
    print("Your point is", point)
    game_over = False

    # Continue rolling until the player hits the established point or rolls a 7
    while not game_over:
        input("Press enter to roll the two dice.")
        die1 = random.randint(1, 6)
        die2 = random.randint(1, 6)
        die_sum = die1 + die2
        total_rolls += 1
        print("You rolled a", die1, "and a", die2, "for a total of", die_sum)

        # Check if the roll matches the point (win) or hits 7 (loss / seven-out)
        if die_sum == point:
            print(f"You rolled your point! You win on roll number {total_rolls}.")
            game_over = True
        elif die_sum == 7:
            print(f"You rolled a 7! You lose on roll number {total_rolls}.")
            game_over = True
