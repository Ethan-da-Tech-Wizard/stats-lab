# Program: stats-lab - craps_simulation.py
# Programmer: Ethan-da-Tech-Wizard (written with Claude, an AI assistant)
# Last Modified: 2026-11-18
# Purpose: Plays one game of craps in the terminal: rolls two dice, decides win/lose on the first roll, otherwise keeps rolling until the point or a 7 comes up.
"""

Craps Baby!
Ethan-da-Tech-Wizard
09/12/2026
I will be simulating the game of craps. The user will roll two dice and the program will determine if they win or lose based on the rules of craps. If the user does not win or lose on the first roll, they will continue to roll until they either roll their point again (and win) or roll a 7 (and lose).

"""

# ===== Imports =====
# random gives us random numbers to simulate the dice.
import random

# ===== First roll (the "come-out" roll) =====
# Wait for the player to press enter before rolling.

input("Press enter to roll the two dice.")
# Each die is a random whole number from 1 to 6.
die1 = random.randint(1, 6)
die2 = random.randint(1, 6)
# The game is played on the sum of the two dice.
die_sum = die1 + die2
# Count of rolls so far (this is the first roll).
total_rolls = 1
print("You rolled a", die1, "and a", die2, "for a total of", die_sum)
# Craps rules: 7 or 11 on the first roll wins at once.
if die_sum == 7 or die_sum == 11:
    print("You are a winner in one roll of the dice!")
# 2, 3 or 12 on the first roll loses at once.
elif die_sum == 2 or die_sum == 3 or die_sum == 12:
    print("You are a loser in one roll of the dice!")
# Any other total becomes the "point"; keep rolling until we hit it again or roll a 7.
else:
    # Remember the first-roll total as the point.
    point = die_sum
    print("Your point is", point)
    # Flag that tells the loop when the game has ended.
    game_over = False
    # ===== Rolling for the point =====
    # Repeat until a win or a loss sets game_over to True.
    while not game_over:
        input("Press enter to roll the two dice.")
        # Roll both dice again.
        die1 = random.randint(1, 6)
        die2 = random.randint(1, 6)
        die_sum = die1 + die2
        # Note: this sets the roll number to 2 every time (it does not add 1 per loop).
        total_rolls = 2
        print("You rolled a", die1, "and a", die2, "for a total of", die_sum)
        # Rolling the point again wins.
        if die_sum == point:
            print(f"You rolled your point! You win on roll number {total_rolls}.")
            game_over = True
        # Rolling a 7 before the point loses.
        elif die_sum == 7: 
                print(f"You rolled a 7! You lose on roll number {total_rolls}.")
                game_over = True