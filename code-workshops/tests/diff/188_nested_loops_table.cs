using System;

class Program
{
    static void Main()
    {
        for (int i = 1; i <= 3; i++)
        {
            for (int j = 1; j <= 3; j++)
            {
                Console.Write("{0,4}", i * j);
            }
            Console.WriteLine();
        }
    }
}
