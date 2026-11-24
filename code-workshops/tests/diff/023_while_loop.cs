using System;

class Program
{
    static void Main()
    {
        int i = 1;
        int sum = 0;
        while (i <= 10)
        {
            sum = sum + i;
            i++;
        }
        Console.WriteLine(sum);
        int n = 27, steps = 0;
        while (n != 1)
        {
            if (n % 2 == 0) n = n / 2; else n = 3 * n + 1;
            steps++;
        }
        Console.WriteLine(steps);
    }
}
